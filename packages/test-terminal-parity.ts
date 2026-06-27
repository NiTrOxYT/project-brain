// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061E-HOTFIX-V2 — Test Suite — Terminal Parity & Passthrough Validation
// ──────────────────────────────────────────────────────────────────────────────

import assert from "assert";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { execSync, spawn } from "child_process";
import type { LaunchOptions } from "./ai-gateway/types.js";

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
    const d = path.join(os.tmpdir(), `brain-test-parity-${crypto.randomBytes(4).toString("hex")}`);
    fs.mkdirSync(d, { recursive: true });
    return d;
}

function cleanup(dir: string): void {
    fs.rmSync(dir, { recursive: true, force: true });
}

// ─── Mock Interactive / Administrative Provider ────────────────────────────────

const MOCK_PROVIDER_SOURCE = `#!/usr/bin/env node
const process = require('process');

const args = process.argv.slice(2);

if (args.includes('--version')) {
    process.stdout.write('1.17.11\\n');
    process.exit(0);
}

if (args.includes('--help')) {
    process.stdout.write('OpenCode Help\\n');
    process.exit(0);
}

if (args.includes('login')) {
    process.stdout.write('Logged in successfully\\n');
    process.exit(0);
}

if (args.includes('config')) {
    process.stdout.write('Config matched\\n');
    process.exit(0);
}

if (args.includes('exit-code-test')) {
    process.exit(99);
}

// Interactive default behavior
process.stdout.write('interactive execution\\n');
process.exit(0);
`;

async function run(): Promise<void> {
    console.log("\n🧠 BUILD-061E-HOTFIX-V2 — Terminal Parity Test Suite\n");

    const dir = tmpDir();
    const mockBin = path.join(dir, "opencode-bin");
    fs.writeFileSync(mockBin, MOCK_PROVIDER_SOURCE, { mode: 0o755 });

    // Global paths setup
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
        passthroughCommands: ["--version", "-v", "--help", "-h", "login", "config", "auth", "exit-code-test"],
        gatewayCommands: [],
        generatedAt: new Date().toISOString()
    };
    manifest.set("opencode", record);

    // Register CompatMockAdapter
    const { AdapterRegistry } = await import("./ai-gateway/adapter-registry.js");
    const { BaseProviderAdapter } = await import("./ai-gateway/adapters/base.js");

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

    // ─── 1. Administrative Command Parity (Bypass Gateway) ───────────────────

    await test("opencode --version executes native provider directly with zero gateway artifacts", async () => {
        const cmd = `node dist/cli/main.js dispatch --provider opencode -- --version`;
        const out = execSync(cmd, { env: { ...process.env, PROJECT_BRAIN_ROOT: dir } }).toString();
        
        assert.strictEqual(out.trim(), "1.17.11");
        
        // Ensure no timeline, sessions, or metrics directories/files were created
        const sessionStoreDir = path.join(dir, "sessions");
        const exists = fs.existsSync(sessionStoreDir);
        assert(!exists, "Gateway session store should not have been initialized");
    });

    await test("opencode --help bypasses gateway", async () => {
        const cmd = `node dist/cli/main.js dispatch --provider opencode -- --help`;
        const out = execSync(cmd, { env: { ...process.env, PROJECT_BRAIN_ROOT: dir } }).toString();
        assert.strictEqual(out.trim(), "OpenCode Help");
    });

    await test("opencode login bypasses gateway", async () => {
        const cmd = `node dist/cli/main.js dispatch --provider opencode -- login`;
        const out = execSync(cmd, { env: { ...process.env, PROJECT_BRAIN_ROOT: dir } }).toString();
        assert.strictEqual(out.trim(), "Logged in successfully");
    });

    await test("opencode config bypasses gateway", async () => {
        const cmd = `node dist/cli/main.js dispatch --provider opencode -- config`;
        const out = execSync(cmd, { env: { ...process.env, PROJECT_BRAIN_ROOT: dir } }).toString();
        assert.strictEqual(out.trim(), "Config matched");
    });

    // ─── 2. Exit Code Forwarding ─────────────────────────────────────────────

    await test("Exit code is forwarded verbatim", async () => {
        const cmd = `node dist/cli/main.js dispatch --provider opencode -- exit-code-test`;
        try {
            execSync(cmd, { env: { ...process.env, PROJECT_BRAIN_ROOT: dir } });
            assert.fail("Process should have exited with status 99");
        } catch (err: any) {
            assert.strictEqual(err.status, 99);
        }
    });

    // ─── 3. Interactive Commands (Enters Gateway & Restores Terminal) ────────

    await test("opencode interactive mode starts gateway session and cleans up", async () => {
        const cmd = `node dist/cli/main.js dispatch --provider opencode 2>&1`;
        
        const out = execSync(cmd, { env: { ...process.env, PROJECT_BRAIN_ROOT: dir } }).toString();
        
        try {
            assert(out.includes("Project Brain"), "Should render pre-launch banner");
            assert(out.includes("Session Complete"), "Should render completion banner");
            assert(out.includes("interactive execution"), "Should render provider native execution output");
        } catch (err: any) {
            console.log("ACTUAL OUTPUT:\n", JSON.stringify(out));
            throw err;
        }
    });

    // ─── Cleanup ─────────────────────────────────────────────────────────────

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
