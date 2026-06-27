// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061E — Test Suite — Wrapper Compatibility & Transparency
// ──────────────────────────────────────────────────────────────────────────────

import assert from "assert";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { execSync, spawn } from "child_process";
import type { LaunchOptions } from "./ai-gateway/types.js";

// ─── Test Infrastructure ─────────────────────────────────────────────────────

let testsPassed = 0;
let testsFailed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
    return Promise.resolve(fn()).then(
        () => { testsPassed++; console.log(`  ✓  ${name}`); },
        (err: any) => {
            testsFailed++;
            console.log(`  ✗  ${name}`);
            console.log(`     ${err.message}`);
            if (err.stack) console.log(err.stack);
        },
    );
}

function tmpDir(): string {
    const d = path.join(os.tmpdir(), `brain-test-compat-${crypto.randomBytes(4).toString("hex")}`);
    fs.mkdirSync(d, { recursive: true });
    return d;
}

function cleanup(dir: string): void {
    fs.rmSync(dir, { recursive: true, force: true });
}

// ─── Mock Executable Provider Binary ──────────────────────────────────────────

const MOCK_NATIVE_CONTENT = `#!/usr/bin/env node
const process = require('process');

const args = process.argv.slice(2);

// Handle standard passthroughs
if (args.includes('--version') || args.includes('-v')) {
    console.log('1.17.11');
    process.exit(0);
}
if (args.includes('--help') || args.includes('-h')) {
    console.log('OpenCode CLI help menu');
    process.exit(0);
}
if (args.includes('login')) {
    console.log('login successful');
    process.exit(0);
}
if (args.includes('config')) {
    console.log('config value set');
    process.exit(0);
}
if (args.includes('auth')) {
    console.log('authenticated');
    process.exit(0);
}
if (args.includes('exit-code-test')) {
    console.log('exiting with status 42');
    process.exit(42);
}
if (args.includes('color-test')) {
    process.stdout.write('\\x1b[31mRed Color\\x1b[0m\\n');
    process.exit(0);
}

// Default interactive loop
console.log('native provider run');
if (args.length > 0) {
    console.log('Prompt: ' + args.join(' '));
}
process.exit(0);
`;

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

async function run(): Promise<void> {
    console.log("\n🧠 BUILD-061E — Wrapper Compatibility Test Suite\n");

    const dir = tmpDir();
    const mockBin = path.join(dir, "opencode-bin");
    fs.writeFileSync(mockBin, MOCK_NATIVE_CONTENT, { mode: 0o755 });

    // Set up manifest with the mock binary
    const { ManifestManager } = await import("./installer/manifest.js");
    const { GlobalPaths } = await import("./kernel/paths.js");
    const gp = new GlobalPaths(dir);
    const manifest = new ManifestManager(gp.wrappersDir);

    const record = {
        provider: "opencode",
        version: "1.17.11",
        checksum: "abc",
        createdAt: new Date().toISOString(),
        installerVersion: "0.1.0",
        wrapperPath: gp.binEntry("opencode"),
        realBinaryPath: mockBin,
        wrapperVersion: "0.1.0",
        providerVersion: "1.17.11",
        providerBinary: mockBin,
        providerCapabilities: ["analyze"],
        passthroughCommands: ["--version", "-v", "--help", "-h", "login", "config", "auth", "exit-code-test", "color-test"],
        gatewayCommands: [],
        generatedAt: new Date().toISOString()
    };
    manifest.set("opencode", record);

    // Register our test mock adapter in global registry
    const { AdapterRegistry } = await import("./ai-gateway/adapter-registry.js");
    const { BaseProviderAdapter } = await import("./ai-gateway/adapters/base.js");
    // LaunchOptions is type-only, import it dynamically at the top of file or use standard type import

    class CompatMockAdapter extends BaseProviderAdapter {
        readonly id = "opencode";
        readonly displayName = "OpenCode Test";
        readonly version = "1.17.11";
        readonly binaryName = "opencode-bin";

        protected buildArgs(opts: LaunchOptions): string[] {
            return opts.extraArgs;
        }
        metadata() {
            return {
                id: this.id,
                displayName: this.displayName,
                version: this.version,
                capabilities: ["analyze"],
                supportsStreaming: true,
            };
        }
        passthroughCommands() {
            return record.passthroughCommands;
        }
        resolvedBinaryPath(): Promise<string> {
            return Promise.resolve(mockBin);
        }
    }

    AdapterRegistry.register(new CompatMockAdapter());

    // ─── 1. --version passthrough ──────────────────────────────────────────

    await test("--version passthrough matches direct execution exactly", async () => {
        const cmd = `node dist/cli/main.js dispatch --provider opencode -- --version`;
        const out = execSync(cmd, { env: { ...process.env, PROJECT_BRAIN_ROOT: dir } }).toString();
        assert.strictEqual(out.trim(), "1.17.11");
    });

    // ─── 2. --help passthrough ─────────────────────────────────────────────

    await test("--help passthrough matches help menu output", async () => {
        const cmd = `node dist/cli/main.js dispatch --provider opencode -- --help`;
        const out = execSync(cmd, { env: { ...process.env, PROJECT_BRAIN_ROOT: dir } }).toString();
        assert.strictEqual(out.trim(), "OpenCode CLI help menu");
    });

    // ─── 3. login passthrough ──────────────────────────────────────────────

    await test("login passthrough matches login output", async () => {
        const cmd = `node dist/cli/main.js dispatch --provider opencode -- login`;
        const out = execSync(cmd, { env: { ...process.env, PROJECT_BRAIN_ROOT: dir } }).toString();
        assert.strictEqual(out.trim(), "login successful");
    });

    // ─── 4. config passthrough ─────────────────────────────────────────────

    await test("config passthrough matches config output", async () => {
        const cmd = `node dist/cli/main.js dispatch --provider opencode -- config`;
        const out = execSync(cmd, { env: { ...process.env, PROJECT_BRAIN_ROOT: dir } }).toString();
        assert.strictEqual(out.trim(), "config value set");
    });

    // ─── 5. auth passthrough ───────────────────────────────────────────────

    await test("auth passthrough matches auth output", async () => {
        const cmd = `node dist/cli/main.js dispatch --provider opencode -- auth`;
        const out = execSync(cmd, { env: { ...process.env, PROJECT_BRAIN_ROOT: dir } }).toString();
        assert.strictEqual(out.trim(), "authenticated");
    });

    // ─── 6. exit code preservation ─────────────────────────────────────────

    await test("exit code is forwarded from native process correctly", async () => {
        const cmd = `node dist/cli/main.js dispatch --provider opencode -- exit-code-test`;
        try {
            execSync(cmd, { env: { ...process.env, PROJECT_BRAIN_ROOT: dir } });
            assert.fail("Should have failed with exit status 42");
        } catch (err: any) {
            assert.strictEqual(err.status, 42);
        }
    });

    // ─── 7. ANSI color preservation ─────────────────────────────────────────

    await test("ANSI colors are forwarded verbatim", async () => {
        const cmd = `node dist/cli/main.js dispatch --provider opencode -- color-test`;
        const out = execSync(cmd, { env: { ...process.env, PROJECT_BRAIN_ROOT: dir } }).toString();
        assert(out.includes("\x1b[31mRed Color\x1b[0m"));
    });

    // ─── 8. Debug Mode (BRAIN_DEBUG_WRAPPER=1) ────────────────────────────

    await test("Debug mode outputs detailed dispatch diagnostics", async () => {
        const cmd = `node dist/cli/main.js dispatch --provider opencode -- --version`;
        const out = execSync(cmd, {
            env: {
                ...process.env,
                PROJECT_BRAIN_ROOT: dir,
                BRAIN_DEBUG_WRAPPER: "1"
            }
        }).toString();
        assert(out.includes("Wrapper Dispatcher"));
        assert(out.includes("Classification:\n  Passthrough"));
        assert(out.includes("Reason:\n  Matches passthrough command: --version"));
    });

    // ─── 9. Separation of Wrapper and Provider Versions ───────────────────

    await test("Manifest contains correct version fields", async () => {
        const manifestRecord = manifest.get("opencode");
        assert.strictEqual(manifestRecord?.wrapperVersion, "0.1.0");
        assert.strictEqual(manifestRecord?.providerVersion, "1.17.11");
    });

    // ─── Cleanup ───────────────────────────────────────────────────────────

    cleanup(dir);

    console.log(`\n──────────────────────────────────────`);
    console.log(`  ✓ PASSED: ${testsPassed}`);
    if (testsFailed > 0) {
        console.log(`  ✗ FAILED: ${testsFailed}`);
    }
    console.log(`──────────────────────────────────────\n`);

    if (testsFailed > 0) {
        process.exit(1);
    }
}

run().catch(err => {
    console.error("Fatal test error:", err);
    process.exit(1);
});
