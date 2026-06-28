// ──────────────────────────────────────────────────────────────────────────────
// BUILD-068 — Universal Provider Config & Integration Enhanced Test Suite
// ──────────────────────────────────────────────────────────────────────────────
import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { ProviderDiscoveryEngine } from "./provider-bridge/discovery.js";
import { ProviderConfigurator } from "./provider-bridge/provider-configurator.js";
import { ProviderSchemaRegistry } from "./provider-bridge/schema-registry.js";
import { ProviderVerificationEngine } from "./provider-bridge/provider-verifier.js";
import "./ai-gateway/adapters/index.js";
async function test(name, fn) {
    try {
        await fn();
        console.log(`✓ ${name}`);
    }
    catch (err) {
        console.error(`✗ ${name}`);
        console.error(err.stack || err);
        process.exit(1);
    }
}
async function runTests() {
    console.log("Starting Universal Provider Configuration & Integration Enhanced Test Suite...\n");
    // Create temp directory for test configuration isolation
    const testTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brain-test-068-"));
    // Paths for all 6 providers
    const configPaths = {
        opencode: path.join(testTmpDir, "opencode", "opencode.json"),
        claude: path.join(testTmpDir, "claude", "claude_desktop.json"),
        "claude-code": path.join(testTmpDir, "claude-code", "mcp.json"),
        codex: path.join(testTmpDir, "codex", "config.toml"),
        continue: path.join(testTmpDir, "continue", "config.yaml"),
        aider: path.join(testTmpDir, "aider", ".aider.conf.yml")
    };
    // Make sure directories exist
    for (const p of Object.values(configPaths)) {
        fs.mkdirSync(path.dirname(p), { recursive: true });
    }
    // Monkey-patch ProviderConfigurator.getActiveConfigPath
    const origGetActiveConfigPath = ProviderConfigurator.getActiveConfigPath;
    ProviderConfigurator.getActiveConfigPath = (providerId, workspaceRoot) => {
        const p = configPaths[providerId];
        if (p) {
            return { path: p, source: "global" };
        }
        return origGetActiveConfigPath.call(ProviderConfigurator, providerId, workspaceRoot);
    };
    // Helper to clean files in tmp dir
    const cleanFiles = () => {
        for (const p of Object.values(configPaths)) {
            if (fs.existsSync(p))
                fs.unlinkSync(p);
            // Clean backups too
            const dir = path.dirname(p);
            const files = fs.readdirSync(dir);
            for (const f of files) {
                if (f.includes(".backup-")) {
                    fs.unlinkSync(path.join(dir, f));
                }
            }
        }
    };
    // ──────────────────────────────────────────────────────────────────────────
    // 1. Adapter Registry Discovery
    // ──────────────────────────────────────────────────────────────────────────
    await test("1. Discovery Engine resolves config details for all 6 adapters", () => {
        cleanFiles();
        // Write empty default configs to simulate installed state
        fs.writeFileSync(configPaths.opencode, "{}", "utf-8");
        fs.writeFileSync(configPaths.claude, "{}", "utf-8");
        fs.writeFileSync(configPaths["claude-code"], "{}", "utf-8");
        fs.writeFileSync(configPaths.codex, "", "utf-8"); // empty toml
        fs.writeFileSync(configPaths.continue, "mcpServers: []", "utf-8");
        fs.writeFileSync(configPaths.aider, "read: []", "utf-8");
        const providers = ["opencode", "claude", "claude-code", "codex", "continue", "aider"];
        for (const pid of providers) {
            const config = ProviderDiscoveryEngine.discover(pid, testTmpDir);
            assert.ok(config, `Discovery should return configuration for ${pid}`);
            assert.strictEqual(config.providerId, pid);
            assert.ok(config.configCapabilities, `${pid} must expose configCapabilities`);
            assert.ok(config.capabilities, `${pid} must expose legacy capabilities`);
            // Check transport support constraints
            if (pid === "aider") {
                assert.strictEqual(config.supportedTransports.length, 0, "Aider does not support MCP transport");
            }
            else {
                assert.ok(config.supportedTransports.includes("stdio"), `${pid} should support stdio transport`);
            }
        }
    });
    // ──────────────────────────────────────────────────────────────────────────
    // 2. Transactional Backups
    // ──────────────────────────────────────────────────────────────────────────
    await test("2. Configuration backup is created on successful merge", async () => {
        cleanFiles();
        // Write initial content
        fs.writeFileSync(configPaths.claude, JSON.stringify({ mcpServers: { existing: { command: "test" } } }), "utf-8");
        // Run configuration
        const res = await ProviderConfigurator.configure("claude", { transport: "stdio" });
        assert.strictEqual(res.success, true, res.error);
        // Check that a backup file was created
        const dir = path.dirname(configPaths.claude);
        const files = fs.readdirSync(dir);
        const backupFile = files.find(f => f.startsWith("claude_desktop.json.backup-"));
        assert.ok(backupFile, "Backup file should be created");
        const backupContent = fs.readFileSync(path.join(dir, backupFile), "utf-8");
        const parsedBackup = JSON.parse(backupContent);
        assert.ok(parsedBackup.mcpServers.existing, "Backup should preserve original content");
    });
    // ──────────────────────────────────────────────────────────────────────────
    // 3. Rollback on Validation Failure
    // ──────────────────────────────────────────────────────────────────────────
    await test("3. Failed validation transactionally rolls back config and cleans backups", async () => {
        cleanFiles();
        const original = JSON.stringify({ mcpServers: { myServer: { command: "node" } } }, null, 2);
        fs.writeFileSync(configPaths.claude, original, "utf-8");
        // Monkey-patch validate function of Claude adapter to fail
        const schema = ProviderSchemaRegistry.get("claude");
        assert.ok(schema);
        const origValidate = schema.validate;
        schema.validate = () => "Mocked validation error";
        try {
            const res = await ProviderConfigurator.configure("claude", { transport: "stdio" });
            assert.strictEqual(res.success, false);
            assert.ok(res.error?.includes("Mocked validation error"));
            // Verify config is rolled back to original
            const rolledBack = fs.readFileSync(configPaths.claude, "utf-8");
            assert.strictEqual(rolledBack, original, "Config must be restored to original content");
            // Verify temp backup file is deleted
            const dir = path.dirname(configPaths.claude);
            const files = fs.readdirSync(dir);
            const backupFile = files.find(f => f.startsWith("claude_desktop.json.backup-"));
            assert.strictEqual(backupFile, undefined, "Backup file must be deleted on rollback");
        }
        finally {
            // Restore original validation
            schema.validate = origValidate;
        }
    });
    // ──────────────────────────────────────────────────────────────────────────
    // 4. Schema Validations for Continue.dev and Codex TOML
    // ──────────────────────────────────────────────────────────────────────────
    await test("4. Continue.dev YAML and Codex TOML write valid configurations and pass validation", async () => {
        cleanFiles();
        // 4a. Codex TOML
        fs.writeFileSync(configPaths.codex, "[mcp_servers.other]\ncommand = 'other'", "utf-8");
        let res = await ProviderConfigurator.configure("codex", { transport: "stdio" });
        assert.strictEqual(res.success, true, res.error);
        assert.ok(ProviderConfigurator.isConfigured("codex"));
        // 4b. Continue.dev YAML
        fs.writeFileSync(configPaths.continue, "mcpServers:\n  - name: other\n    type: stdio\n    command: other", "utf-8");
        res = await ProviderConfigurator.configure("continue", { transport: "stdio" });
        assert.strictEqual(res.success, true, res.error);
        assert.ok(ProviderConfigurator.isConfigured("continue"));
    });
    // ──────────────────────────────────────────────────────────────────────────
    // 5. Verification Stage Skipped Logic
    // ──────────────────────────────────────────────────────────────────────────
    await test("5. Verification stages skip unsupported capabilities gracefully", async () => {
        cleanFiles();
        // Write configuration for Aider (which has no stdio/http MCP capabilities)
        fs.writeFileSync(configPaths.aider, "read:\n  - .brain/instructions.txt", "utf-8");
        const verification = await ProviderVerificationEngine.verify("aider", testTmpDir);
        assert.strictEqual(verification.stages.installation, "Passed");
        assert.strictEqual(verification.stages.configuration, "Passed");
        assert.strictEqual(verification.stages.connectivity, "Skipped", "Connectivity verification must be skipped for Aider");
        assert.strictEqual(verification.stages.behavioral, "Skipped", "Behavioral verification must be skipped for Aider");
        assert.strictEqual(verification.level3, true, "Level 3 must be true (Skipped maps to passed level)");
    });
    // Restore original ProviderConfigurator method
    ProviderConfigurator.getActiveConfigPath = origGetActiveConfigPath;
    // Cleanup temp dir
    try {
        fs.rmSync(testTmpDir, { recursive: true, force: true });
    }
    catch { }
    console.log("\nAll Universal Provider Config & Integration Enhanced tests passed successfully!\n");
}
runTests();
