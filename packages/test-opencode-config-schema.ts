// ──────────────────────────────────────────────────────────────────────────────
// BUILD-067C — OpenCode Configuration Schema Regression Tests
// Verifies that ProviderConfigurator writes configurations that are accepted
// by the official OpenCode schema (https://opencode.ai/config.json).
// ──────────────────────────────────────────────────────────────────────────────

import assert from "assert";
import fs     from "fs";
import os     from "os";
import path   from "path";
import { ProviderConfigurator } from "./provider-bridge/provider-configurator.js";
import "./ai-gateway/adapters/index.js";

// ─── Test helpers ─────────────────────────────────────────────────────────────

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
    try {
        await fn();
        console.log(`✓ ${name}`);
    } catch (err: any) {
        console.error(`✗ ${name}`);
        console.error(`  ${err.message}`);
        if (err.stack) console.error(err.stack.split("\n").slice(1).join("\n"));
        process.exit(1);
    }
}

/** Resolve the real config path through the configurator (so tests move with it). */
const configPath = ProviderConfigurator.getConfigPath("opencode");

// ─── Test isolation ──────────────────────────────────────────────────────────
// CRITICAL: redirect all config reads/writes to a temp directory so the real
// ~/.config/opencode/opencode.json is NEVER modified by the test suite.
const TEST_TMP_DIR    = fs.mkdtempSync(path.join(os.tmpdir(), "brain-test-067c-"));
const TEST_CONFIG_DIR = path.join(TEST_TMP_DIR, "opencode");
const TEST_CONFIG     = path.join(TEST_CONFIG_DIR, "opencode.json");
fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });

// Monkey-patch getConfigPath during the test run
const _origGetConfigPath = ProviderConfigurator.getConfigPath.bind(ProviderConfigurator);
(ProviderConfigurator as any).getConfigPath = (id: string): string => {
    if (id === "opencode") return TEST_CONFIG;
    return _origGetConfigPath(id);
};

const _origGetActiveConfigPath = ProviderConfigurator.getActiveConfigPath.bind(ProviderConfigurator);
(ProviderConfigurator as any).getActiveConfigPath = (id: string, workspaceRoot?: string) => {
    if (id === "opencode") return { path: TEST_CONFIG, source: "global" };
    return _origGetActiveConfigPath(id, workspaceRoot);
};

process.on("exit", () => {
    // Cleanup temp directory on exit
    try { fs.rmSync(TEST_TMP_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});

/** Fully delete the test config file to ensure clean state between tests. */
function cleanConfig(): void {
    if (fs.existsSync(TEST_CONFIG)) {
        fs.unlinkSync(TEST_CONFIG);
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests(): Promise<void> {
    console.log("Starting BUILD-067C OpenCode Configuration Schema Regression Test Suite...\n");

    // ── 1. Correct root key ────────────────────────────────────────────────────
    await test("1. configure() writes 'mcp' root key, not 'mcpServers'", async () => {
        cleanConfig();
        const res = await ProviderConfigurator.configure("opencode", { transport: "stdio" });
        assert.strictEqual(res.success, true, res.error);

        const raw  = fs.readFileSync(TEST_CONFIG, "utf-8");
        const data = JSON.parse(raw);

        assert.ok(data.mcp,            "Root key 'mcp' must exist");
        assert.ok(data.mcp.brain,      "'mcp.brain' entry must exist");
        assert.strictEqual(data.mcpServers, undefined, "'mcpServers' must NOT be written");

        cleanConfig();
    });

    // ── 2. Local entry shape (type + command array) ────────────────────────────
    await test("2. Local stdio entry has type:'local' and command as string[]", async () => {
        cleanConfig();
        await ProviderConfigurator.configure("opencode", { transport: "stdio" });

        const data  = JSON.parse(fs.readFileSync(TEST_CONFIG, "utf-8"));
        const entry = data.mcp.brain;

        assert.strictEqual(entry.type,          "local",               "type must be 'local'");
        assert.ok(Array.isArray(entry.command),                        "command must be an array");
        assert.ok(entry.command.length > 0,                            "command must be non-empty");
        assert.strictEqual(typeof entry.command[0], "string",          "command elements must be strings");
        // Verify it launches Brain stdio
        assert.strictEqual(entry.command[0], "brain");
        assert.deepStrictEqual(entry.command.slice(1), ["mcp", "stdio"]);
        assert.strictEqual(entry.enabled, true,                        "enabled must be true");
        // Must NOT have a string 'args' property (that's the old mcpServers shape)
        assert.strictEqual(entry.args, undefined,                      "must not have separate 'args' field");

        cleanConfig();
    });

    // ── 3. Remote entry shape ──────────────────────────────────────────────────
    await test("3. Remote HTTP entry has type:'remote' and url string", async () => {
        cleanConfig();
        await ProviderConfigurator.configure("opencode", { transport: "http", port: 8765 });

        const data  = JSON.parse(fs.readFileSync(TEST_CONFIG, "utf-8"));
        const entry = data.mcp.brain;

        assert.strictEqual(entry.type,    "remote",                   "type must be 'remote'");
        assert.strictEqual(entry.url,     "http://127.0.0.1:8765",    "url must match");
        assert.strictEqual(entry.command, undefined,                   "must not have 'command'");

        cleanConfig();
    });

    // ── 4. Idempotent merge — preserves existing user settings ─────────────────
    await test("4. configure() preserves unrelated user settings (model, agent, etc.)", async () => {
        cleanConfig();

        // Write a realistic existing OpenCode config with real schema fields
        const existing = {
            "$schema": "https://opencode.ai/config.json",
            "model":   "anthropic/claude-sonnet-4-5",
            "agent": {
                "build": { "prompt": "You are a coding assistant." }
            },
            "autoupdate": "notify",
        };
        const dir = path.dirname(TEST_CONFIG);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(TEST_CONFIG, JSON.stringify(existing, null, 2), "utf-8");

        const res = await ProviderConfigurator.configure("opencode", { transport: "stdio" });
        assert.strictEqual(res.success, true, res.error);

        const data = JSON.parse(fs.readFileSync(TEST_CONFIG, "utf-8"));
        assert.strictEqual(data["$schema"], existing["$schema"], "$schema preserved");
        assert.strictEqual(data.model,       existing.model,      "model preserved");
        assert.deepStrictEqual(data.agent,   existing.agent,      "agent config preserved");
        assert.strictEqual(data.autoupdate,  existing.autoupdate, "autoupdate preserved");
        assert.ok(data.mcp?.brain,                                "brain MCP entry added");

        cleanConfig();
    });

    // ── 5. Legacy mcpServers.brain is migrated automatically ──────────────────
    await test("5. configure() migrates legacy mcpServers.brain to mcp.brain automatically", async () => {
        cleanConfig();

        // Simulate the old broken installer having written mcpServers.brain
        const legacyConfig = {
            "$schema": "https://opencode.ai/config.json",
            "model":   "anthropic/claude-sonnet-4-5",
            "mcpServers": {
                "brain": { "command": "brain", "args": ["mcp", "stdio"] }
            }
        };
        const dir = path.dirname(TEST_CONFIG);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(TEST_CONFIG, JSON.stringify(legacyConfig, null, 2), "utf-8");

        const res = await ProviderConfigurator.configure("opencode", { transport: "stdio" });
        assert.strictEqual(res.success, true, `Migration should succeed: ${res.error}`);

        const data = JSON.parse(fs.readFileSync(TEST_CONFIG, "utf-8"));
        // New key must be written
        assert.ok(data.mcp?.brain,              "mcp.brain must be written");
        assert.strictEqual(data.mcp.brain.type, "local");
        // Old key must be removed
        assert.strictEqual(data.mcpServers,     undefined, "mcpServers must be removed");
        // Unrelated settings preserved
        assert.strictEqual(data.model, legacyConfig.model, "model preserved");

        cleanConfig();
    });

    // ── 5b. Validation rejects configs with unknown root keys ──────────────────
    await test("5b. configure() rejects existing config that has unknown root keys (e.g. 'badKey')", async () => {
        cleanConfig();

        // Simulate a config with an unsupported key (not from our installer)
        const corrupt = { "badKey": "some value" };
        const dir = path.dirname(TEST_CONFIG);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(TEST_CONFIG, JSON.stringify(corrupt, null, 2), "utf-8");

        const res = await ProviderConfigurator.configure("opencode", { transport: "stdio" });
        assert.strictEqual(res.success, false, "Should fail validation");
        assert.ok(res.error?.includes("badKey"), `Error should mention the unknown key, got: ${res.error}`);

        // Config must NOT have been modified
        const after = JSON.parse(fs.readFileSync(TEST_CONFIG, "utf-8"));
        assert.strictEqual(after.mcp, undefined, "mcp must not have been written on failure");

        // Clean up
        fs.unlinkSync(TEST_CONFIG);
    });

    // ── 6. isConfigured reads 'mcp.brain', not 'mcpServers.brain' ─────────────
    await test("6. isConfigured() returns true only when mcp.brain exists", async () => {
        cleanConfig();

        // Old-style mcpServers config must NOT be considered configured
        const oldStyle = { "mcpServers": { "brain": { "command": "brain", "args": ["mcp", "stdio"] } } };
        const dir = path.dirname(TEST_CONFIG);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(TEST_CONFIG, JSON.stringify(oldStyle, null, 2), "utf-8");
        assert.strictEqual(ProviderConfigurator.isConfigured("opencode"), false,
            "Legacy mcpServers config must NOT be considered configured");

        // New-style mcp config must be considered configured
        await ProviderConfigurator.configure("opencode", { transport: "stdio" });
        assert.strictEqual(ProviderConfigurator.isConfigured("opencode"), true,
            "New mcp config must be considered configured");

        cleanConfig();
    });

    // ── 7. unconfigure() removes only the brain entry, leaves others intact ────
    await test("7. unconfigure() removes mcp.brain and preserves other mcp entries", async () => {
        cleanConfig();

        // Install brain + a fake user-defined server
        const initial = {
            "mcp": {
                "my-tools": { "type": "local", "command": ["npx", "my-tools"] },
                "brain":    { "type": "local", "command": ["brain", "mcp", "stdio"], "enabled": true }
            }
        };
        const dir = path.dirname(TEST_CONFIG);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(TEST_CONFIG, JSON.stringify(initial, null, 2), "utf-8");

        await ProviderConfigurator.unconfigure("opencode");

        const data = JSON.parse(fs.readFileSync(TEST_CONFIG, "utf-8"));
        assert.strictEqual(data.mcp?.brain, undefined,     "brain entry removed");
        assert.ok(data.mcp?.["my-tools"],                  "other mcp entries preserved");

        cleanConfig();
    });

    // ── 8. Full round-trip: configure → read back → matches schema ─────────────
    await test("8. Full round-trip produces schema-valid config (real example from docs)", async () => {
        cleanConfig();

        // Start from the example config from OpenCode documentation
        const docsExample = {
            "$schema":   "https://opencode.ai/config.json",
            "model":     "anthropic/claude-sonnet-4-5",
            "autoupdate": true,
            "mcp": {
                "my-local-server": {
                    "type":    "local",
                    "command": ["npx", "-y", "my-mcp-server"],
                    "enabled": true
                }
            }
        };
        const dir = path.dirname(TEST_CONFIG);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(TEST_CONFIG, JSON.stringify(docsExample, null, 2), "utf-8");

        const res = await ProviderConfigurator.configure("opencode", { transport: "stdio" });
        assert.strictEqual(res.success, true, `configure() failed: ${res.error}`);

        const data = JSON.parse(fs.readFileSync(TEST_CONFIG, "utf-8"));

        // Schema spot-checks
        assert.strictEqual(data["$schema"],     docsExample["$schema"]);
        assert.strictEqual(data.model,          docsExample.model);
        assert.ok(data.mcp["my-local-server"],  "pre-existing mcp server preserved");
        assert.strictEqual(data.mcp.brain.type, "local");
        assert.deepStrictEqual(data.mcp.brain.command, ["brain", "mcp", "stdio"]);

        cleanConfig();
    });

    // ── 9. Integration: validate config is accepted by OpenCode binary ─────────
    await test("9. Generated config is accepted by 'opencode --version' (smoke test for parse errors)", async () => {
        cleanConfig();
        await ProviderConfigurator.configure("opencode", { transport: "stdio" });

        // Try to run opencode --version or opencode --help which parses config.
        // If config is invalid opencode exits non-zero and prints the rejection.
        const { execFile } = await import("child_process");
        const { promisify } = await import("util");
        const execFileAsync = promisify(execFile);

        let opencodeAvailable = false;
        try {
            await execFileAsync("which", ["opencode"]);
            opencodeAvailable = true;
        } catch { /* opencode not in PATH — skip live validation */ }

        if (opencodeAvailable) {
            try {
                await execFileAsync("opencode", ["--version"], { timeout: 8000 });
                // If we get here without "Configuration is invalid" → pass
            } catch (err: any) {
                const out = (err.stdout ?? "") + (err.stderr ?? "");
                if (out.includes("Configuration is invalid") || out.includes("Unrecognized keys")) {
                    assert.fail(`OpenCode rejected the generated config:\n${out}`);
                }
                // Other non-zero exits (missing API key, etc.) are acceptable
            }
        } else {
            console.log("    ℹ  opencode not in PATH — skipping live binary validation (config shape already verified above)");
        }

        cleanConfig();
    });

    console.log("\nAll BUILD-067C regression tests passed successfully!");
}

runTests();
