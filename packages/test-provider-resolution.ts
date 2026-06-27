// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061D-HOTFIX-V2 — Test Suite — Provider Resolution & Diagnostics
// ──────────────────────────────────────────────────────────────────────────────

import assert from "assert";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { spawn } from "child_process";

// ─── Imports ─────────────────────────────────────────────────────────────────

import { ProviderResolverService, type ProviderResolution } from "./ai-gateway/provider-resolver.js";
import { createKernelContext } from "./sdk/index.js";
import { GlobalPaths } from "./kernel/paths.js";
import { AdapterRegistry } from "./ai-gateway/adapter-registry.js";
import { BaseProviderAdapter } from "./ai-gateway/adapters/base.js";
import type { ProviderAdapterMetadata, LaunchOptions, ProviderProcess } from "./ai-gateway/types.js";

// ─── Test Infrastructure ─────────────────────────────────────────────────────

let testsPassed = 0;
let testsFailed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
    return Promise.resolve(fn()).then(
        () => { testsPassed++; console.log(`  ✓  ${name}`); },
        (err: any) => { testsFailed++; console.log(`  ✗  ${name}`); console.log(`     ${err.message}`); },
    );
}

function tmpDir(): string {
    const d = path.join(os.tmpdir(), `brain-test-resolver-${crypto.randomBytes(4).toString("hex")}`);
    fs.mkdirSync(d, { recursive: true });
    return d;
}

function cleanup(dir: string): void {
    fs.rmSync(dir, { recursive: true, force: true });
}

// ─── Mock Adapter ────────────────────────────────────────────────────────────

class MockResolverAdapter extends BaseProviderAdapter {
    readonly id: string;
    readonly displayName: string;
    readonly version = "1.17.11";
    readonly binaryName: string;

    constructor(id: string, binaryName: string) {
        super();
        this.id = id;
        this.displayName = `Mock ${id}`;
        this.binaryName = binaryName;
    }

    protected buildArgs(_opts: LaunchOptions): string[] { return []; }

    metadata(): ProviderAdapterMetadata {
        return {
            id: this.id,
            displayName: this.displayName,
            version: this.version,
            capabilities: ["analyze", "create"],
            supportsStreaming: true,
        };
    }
}

// Register it
AdapterRegistry.register(new MockResolverAdapter("mock-resolver", "mock-resolver-bin"));

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

async function run(): Promise<void> {
    console.log("\n🧠 BUILD-061D-HOTFIX-V2 — Provider Resolution Test Suite\n");

    // ─── 1. Single Provider Registry singleton ────────────────────────────

    await test("Only one provider registry instance exists", async () => {
        const { globalProviderRegistry } = await import("./kernel/registry.js");
        const staticRegistry = (AdapterRegistry as any).registry;
        assert.strictEqual(staticRegistry, globalProviderRegistry);
    });

    // ─── 2. Missing manifest ─────────────────────────────────────────────

    await test("Resolver handles missing manifest fallback gracefully", async () => {
        const dir = tmpDir();
        const gp = new GlobalPaths(dir);
        const resolver = new ProviderResolverService(gp);

        const res = await resolver.resolve("mock-resolver");
        assert.strictEqual(res.source, "not-found");
        assert.strictEqual(res.executableExists, false);
        assert.strictEqual(res.executable, false);

        cleanup(dir);
    });

    // ─── 3. Manifest Resolution & stored binary ───────────────────────────

    await test("Resolver resolves from manifest if stored binary exists", async () => {
        const dir = tmpDir();
        const gp = new GlobalPaths(dir);
        const resolver = new ProviderResolverService(gp);

        // Pre-create real binary
        const realBin = path.join(dir, "real-mock-bin");
        fs.writeFileSync(realBin, "echo 1", { mode: 0o755 });

        // Set manifest
        await resolver.repair("mock-resolver", realBin);

        const res = await resolver.resolve("mock-resolver");
        assert.strictEqual(res.source, "manifest");
        assert.strictEqual(res.resolvedBinary, realBin);
        assert.strictEqual(res.executableExists, true);

        cleanup(dir);
    });

    // ─── 4. Wrapper detection and loop avoidance ──────────────────────────

    await test("Resolver avoids wrappers in Brain bin and falls back", async () => {
        const dir = tmpDir();
        const gp = new GlobalPaths(dir);
        const resolver = new ProviderResolverService(gp);

        // Put a wrapper (dummy script) inside Brain bin directory
        const wrapperFile = gp.binEntry("mock-resolver");
        fs.mkdirSync(gp.binDir, { recursive: true });
        fs.writeFileSync(wrapperFile, "exec brain gateway run", { mode: 0o755 });

        // Set system PATH to mock-resolver wrapper
        const oldPath = process.env.PATH;
        process.env.PATH = gp.binDir + path.delimiter + (oldPath ?? "");

        try {
            const res = await resolver.resolve("mock-resolver");
            // Since it's a wrapper, and no manifest repair was possible (no real binary found), it should be not-found
            assert.strictEqual(res.source, "not-found");
        } finally {
            process.env.PATH = oldPath;
            cleanup(dir);
        }
    });

    // ─── 5. Manifest Automatic Repair ─────────────────────────────────────

    await test("Resolver automatically repairs manifest when binary is deleted", async () => {
        const dir = tmpDir();
        const gp = new GlobalPaths(dir);
        const resolver = new ProviderResolverService(gp);

        // 1. Install mock record
        const realBin = path.join(dir, "real-mock-bin");
        fs.writeFileSync(realBin, "echo 1", { mode: 0o755 });
        await resolver.repair("mock-resolver", realBin);

        // 2. Delete the binary
        fs.rmSync(realBin);

        // 3. Put another valid copy on a sandboxed PATH (different directory)
        const sandboxDir = path.join(dir, "sandbox-path");
        fs.mkdirSync(sandboxDir, { recursive: true });
        // Under Windows check extension, or just normal on POSIX
        const binaryName = "mock-resolver-bin";
        const realBinCopy = path.join(sandboxDir, binaryName);
        fs.writeFileSync(realBinCopy, "echo 2", { mode: 0o755 });

        const oldPath = process.env.PATH;
        process.env.PATH = sandboxDir + path.delimiter + (oldPath ?? "");

        try {
            const res = await resolver.resolve("mock-resolver");
            assert.strictEqual(res.source, "manifest-repair");
            assert.strictEqual(res.resolvedBinary, realBinCopy);

            // Manifest should have updated the record
            const manifest = JSON.parse(fs.readFileSync(path.join(gp.wrappersDir, "manifest.json"), "utf8"));
            assert.strictEqual(manifest.wrappers["mock-resolver"].realBinaryPath, realBinCopy);
        } finally {
            process.env.PATH = oldPath;
            cleanup(dir);
        }
    });

    // ─── 6. LaunchReport Generation ───────────────────────────────────────

    await test("Launch failures produce and save LaunchReport to session", async () => {
        const dir = tmpDir();
        const gp = new GlobalPaths(dir);
        const ctx = createKernelContext(dir, dir);

        // Force resolution to fail by pointing to an unexecutable file
        const { AiGatewayService } = await import("./ai-gateway/service.js");
        const service = new AiGatewayService(ctx);

        // We run gateway session on mock-resolver
        const session = await service.run("mock-resolver", "Optimize code", ["--verbose"]);
        
        assert.strictEqual(session.outcome, "failed");
        const report = (session as any).launchReport;
        assert(report, "launchReport field missing");
        assert.strictEqual(report.provider, "mock-resolver");
        assert.strictEqual(report.spawnSucceeded, false);
        assert(report.error, "report.error missing");

        cleanup(dir);
    });

    // ─── 7. Doctor Integration ───────────────────────────────────────────

    await test("Doctor providers reports detailed status", async () => {
        const { runDoctorProviders } = await import("./cli/commands/doctor.js");
        // Redirect stdout
        let output = "";
        const origLog = console.log;
        console.log = (msg?: any, ...args: any[]) => {
            output += (msg ?? "") + "\n";
        };

        try {
            await runDoctorProviders({ json: false } as any);
            assert(output.includes("Provider"), "Doctor output missing Provider ID");
            assert(output.includes("Wrapper"), "Doctor output missing Wrapper check");
            assert(output.includes("Result"), "Doctor output missing Result check");
        } finally {
            console.log = origLog;
        }
    });

    // ─── 8. Gateway Status verbose ────────────────────────────────────────

    await test("Gateway status --verbose outputs all fields", async () => {
        const { runGateway } = await import("./cli/commands/gateway.js");
        let output = "";
        const origLog = console.log;
        console.log = (msg?: any, ...args: any[]) => {
            output += (msg ?? "") + "\n";
        };

        try {
            await runGateway({ verbose: true, workspace: ".", project: "." } as any, "status", {});
            assert(output.includes("Wrapper Version"), "Verbose status missing Wrapper Version");
            assert(output.includes("Binary:"), "Verbose status missing Binary path");
            assert(output.includes("Binary Resolution Source"), "Verbose status missing Binary Resolution Source");
        } finally {
            console.log = origLog;
        }
    });

    // ─── Summary ─────────────────────────────────────────────────────────

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

// Run the tests
import "./ai-gateway/adapters/index.js";

run().catch(err => {
    console.error("Fatal test error:", err);
    process.exit(1);
});
