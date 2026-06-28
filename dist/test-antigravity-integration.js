// ──────────────────────────────────────────────────────────────────────────────
// Antigravity IDE Integration Test Suite
// ──────────────────────────────────────────────────────────────────────────────
import assert from "assert";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
// Mock os.homedir to use a temporary directory for tests
const originalHomedir = os.homedir;
const tempHome = path.join(os.tmpdir(), `brain-test-home-${crypto.randomBytes(4).toString("hex")}`);
fs.mkdirSync(tempHome, { recursive: true });
os.homedir = () => tempHome;
// Register adapters & plugins
import "./ai-gateway/adapters/index.js";
import { ProviderConfigurator } from "./provider-bridge/provider-configurator.js";
import { AdapterRegistry } from "./ai-gateway/adapter-registry.js";
let testsPassed = 0;
let testsFailed = 0;
async function test(name, fn) {
    try {
        await fn();
        testsPassed++;
        console.log(`  ✓  ${name}`);
    }
    catch (err) {
        testsFailed++;
        console.error(`  ✗  ${name}`);
        console.error(err);
    }
}
async function main() {
    console.log("\n🛸 Testing Antigravity IDE MCP Integration...\n");
    const adapter = AdapterRegistry.lookup("antigravity");
    assert(adapter, "Antigravity adapter must be registered");
    // Clean start: ensure folders do not exist initially
    const geminiDir = path.join(tempHome, ".gemini");
    const configDir = path.join(geminiDir, "config");
    const mcpConfigPath = path.join(configDir, "mcp_config.json");
    await test("detect() returns false if no directories exist", async () => {
        const detected = await adapter.detect();
        assert.strictEqual(detected, false, "Should not detect when directories are missing");
    });
    await test("detect() returns true if ~/.gemini/config exists", async () => {
        fs.mkdirSync(configDir, { recursive: true });
        const detected = await adapter.detect();
        assert.strictEqual(detected, true, "Should detect when ~/.gemini/config exists");
    });
    await test("resolvedBinaryPath() returns config directory on success", async () => {
        const binPath = await adapter.resolvedBinaryPath();
        assert.strictEqual(binPath, configDir);
    });
    await test("clean install creates configuration file with correct schema", async () => {
        // Initial setup - config file empty or missing
        if (fs.existsSync(mcpConfigPath)) {
            fs.rmSync(mcpConfigPath, { force: true });
        }
        const res = await ProviderConfigurator.configure("antigravity", { transport: "stdio" });
        assert(res.success, `Configure failed: ${res.error}`);
        assert(fs.existsSync(mcpConfigPath), "mcp_config.json must be created");
        const parsed = JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8"));
        assert.deepStrictEqual(parsed, {
            mcpServers: {
                brain: {
                    command: "brain",
                    args: ["mcp", "stdio"]
                }
            }
        });
        assert.strictEqual(ProviderConfigurator.isConfigured("antigravity"), true, "Should report isConfigured=true");
    });
    await test("install is idempotent and does not duplicate keys", async () => {
        const res = await ProviderConfigurator.configure("antigravity", { transport: "stdio" });
        assert(res.success, `Idempotent configure failed: ${res.error}`);
        const parsed = JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8"));
        assert.deepStrictEqual(parsed, {
            mcpServers: {
                brain: {
                    command: "brain",
                    args: ["mcp", "stdio"]
                }
            }
        });
    });
    await test("install merges safely and preserves other mcp servers", async () => {
        // Mock existing server in config
        const existingConfig = {
            mcpServers: {
                "other-server": {
                    command: "node",
                    args: ["other.js"]
                }
            }
        };
        fs.writeFileSync(mcpConfigPath, JSON.stringify(existingConfig, null, 2), "utf-8");
        const res = await ProviderConfigurator.configure("antigravity", { transport: "stdio" });
        assert(res.success, `Configure merge failed: ${res.error}`);
        const parsed = JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8"));
        assert.deepStrictEqual(parsed, {
            mcpServers: {
                "other-server": {
                    command: "node",
                    args: ["other.js"]
                },
                brain: {
                    command: "brain",
                    args: ["mcp", "stdio"]
                }
            }
        });
    });
    await test("malformed json recovery re-initializes configuration cleanly", async () => {
        // Write invalid JSON content
        fs.writeFileSync(mcpConfigPath, "{ malformed: [json }", "utf-8");
        const res = await ProviderConfigurator.configure("antigravity", { transport: "stdio" });
        assert(res.success, `Recovery configure failed: ${res.error}`);
        const parsed = JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8"));
        assert(parsed.mcpServers && parsed.mcpServers.brain, "Must recover and register brain server");
    });
    await test("uninstall removes only brain key and preserves others", async () => {
        // Set up config with multiple servers
        const testConfig = {
            mcpServers: {
                "other-server": {
                    command: "node",
                    args: ["other.js"]
                },
                brain: {
                    command: "brain",
                    args: ["mcp", "stdio"]
                }
            }
        };
        fs.writeFileSync(mcpConfigPath, JSON.stringify(testConfig, null, 2), "utf-8");
        const res = await ProviderConfigurator.unconfigure("antigravity");
        assert(res.success, `Unconfigure failed: ${res.error}`);
        const parsed = JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8"));
        assert.deepStrictEqual(parsed, {
            mcpServers: {
                "other-server": {
                    command: "node",
                    args: ["other.js"]
                }
            }
        });
        assert.strictEqual(ProviderConfigurator.isConfigured("antigravity"), false, "Should report isConfigured=false");
    });
    await test("validation logic works against schema failures", async () => {
        // 1. Validating empty content (returns null)
        assert.strictEqual(adapter.validate("", true), null);
        // 2. Validating string JSON
        assert.strictEqual(adapter.validate("[]", true), "Configuration must be a JSON object");
        // 3. Validating null mcpServers
        assert.strictEqual(adapter.validate(JSON.stringify({ mcpServers: null }), true), "mcpServers must be an object");
        // 4. Validating correct schema
        assert.strictEqual(adapter.validate(JSON.stringify({ mcpServers: {} }), true), null);
    });
    // Cleanup mock homedir
    os.homedir = originalHomedir;
    try {
        fs.rmSync(tempHome, { recursive: true, force: true });
    }
    catch { }
    console.log(`\n🛸 Antigravity Tests Summary: ${testsPassed} passed, ${testsFailed} failed.\n`);
    if (testsFailed > 0) {
        process.exit(1);
    }
}
main().catch(err => {
    console.error("Test execution failed:", err);
    process.exit(1);
});
