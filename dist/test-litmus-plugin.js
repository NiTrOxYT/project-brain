// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — Core Architecture Freeze — Litmus Test
// Verifies that a new provider adapter can be added, registered, and executed
// purely as a plug-in without modifying the gateway or CLI source files.
// ──────────────────────────────────────────────────────────────────────────────
import assert from "assert";
import path from "path";
import os from "os";
import fs from "fs";
import { BaseProviderAdapter } from "./ai-gateway/adapters/base.js";
import { createKernelContext, runGatewaySession } from "./sdk/index.js";
import { AdapterRegistry } from "./ai-gateway/index.js";
// ─── DeepSeek Adapter Plugin Implementation ───────────────────────────────────
class DeepSeekAdapter extends BaseProviderAdapter {
    id = "deepseek";
    displayName = "DeepSeek Coder";
    version = "1.0.0";
    binaryName = "deepseek";
    metadata() {
        return {
            id: this.id,
            displayName: this.displayName,
            version: this.version,
            capabilities: ["analyze"],
            supportsStreaming: true,
        };
    }
    async detect() {
        return true;
    }
    async resolvedBinaryPath() {
        return "/usr/local/bin/deepseek-mock";
    }
    async health() {
        return "healthy";
    }
    buildArgs(opts) {
        return opts.extraArgs;
    }
    async launch(opts) {
        return {
            pid: 12345,
            stdout: (async function* () {
                yield "DeepSeek: completed execution.";
            })(),
            stderr: (async function* () {
                // empty
            })(),
            cancel: async () => { },
            wait: async () => ({ code: 0, signal: null }),
        };
    }
}
// ─── Verification Execution ───────────────────────────────────────────────────
async function main() {
    console.log("===============================================================");
    console.log(" BUILD-061B — Litmus Refactor Plugin Verification");
    console.log("===============================================================\n");
    const tempRoot = path.join(os.tmpdir(), "brain-litmus-" + Date.now());
    fs.mkdirSync(tempRoot, { recursive: true });
    try {
        const ctx = createKernelContext(tempRoot, tempRoot);
        console.log("1. Checking that deepseek is NOT registered initiallly…");
        assert.ok(!AdapterRegistry.has("deepseek"));
        console.log("2. Registering DeepSeekAdapter via PluginManager…");
        const plugin = new DeepSeekAdapter();
        await ctx.plugins.register(plugin);
        console.log("3. Verifying plugin presence in AdapterRegistry…");
        assert.ok(AdapterRegistry.has("deepseek"));
        const registered = AdapterRegistry.lookup("deepseek");
        assert.strictEqual(registered.displayName, "DeepSeek Coder");
        console.log("4. Running gateway session via SDK…");
        let output = "";
        ctx.eventBus.on("ProviderOutput", ev => {
            output += ev.payload["chunk"];
        });
        const session = await runGatewaySession(ctx, "deepseek", "write a simple loop", []);
        console.log("5. Checking session results…");
        assert.strictEqual(session.outcome, "success");
        assert.strictEqual(output, "DeepSeek: completed execution.");
        console.log("\n===============================================================");
        console.log(" LITMUS PASS: DeepSeek registered and executed dynamically!");
        console.log("===============================================================");
        fs.rmSync(tempRoot, { recursive: true, force: true });
        process.exit(0);
    }
    catch (err) {
        console.error("\n===============================================================");
        console.error(" LITMUS FAILED:", err.message);
        if (err.stack)
            console.error(err.stack);
        console.error("===============================================================");
        fs.rmSync(tempRoot, { recursive: true, force: true });
        process.exit(1);
    }
}
main();
