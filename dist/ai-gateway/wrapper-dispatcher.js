// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061E — AI Gateway — Wrapper Dispatcher
// Canonical orchestrator of transparent wrapping. Decides passthrough vs gateway,
// forwards native processes verbatim, and supports debug logging.
// ──────────────────────────────────────────────────────────────────────────────
import { spawn } from "child_process";
import { ProviderResolverService } from "./provider-resolver.js";
import { AdapterRegistry } from "./adapter-registry.js";
import { InvocationMode } from "./invocation-classifier.js";
import { GlobalPaths } from "../kernel/paths.js";
import { createKernelContext } from "../sdk/index.js";
import { runGateway } from "../cli/commands/gateway.js";
export class WrapperDispatcher {
    providerId;
    args;
    paths;
    constructor(providerId, args, paths) {
        this.providerId = providerId;
        this.args = args;
        this.paths = paths ?? new GlobalPaths();
    }
    async dispatch() {
        const debugMode = process.env.BRAIN_DEBUG_WRAPPER === "1";
        // 1. Resolve provider
        const resolver = new ProviderResolverService(this.paths);
        const resolution = await resolver.resolve(this.providerId);
        if (!resolution.resolvedBinary || !resolution.executableExists || !resolution.executable) {
            process.stderr.write(`Error: Provider binary for "${this.providerId}" not found or not executable.\n`);
            process.exit(1);
        }
        // 2. Classify invocation
        const adapter = AdapterRegistry.lookup(this.providerId);
        const decision = adapter.classifyInvocation(this.args);
        // Unknown defaults to Passthrough to prevent breaking future commands
        const mode = decision.mode === InvocationMode.Unknown ? InvocationMode.Passthrough : decision.mode;
        if (mode === InvocationMode.Passthrough) {
            if (debugMode) {
                process.stdout.write(`Wrapper Dispatcher\n`);
                process.stdout.write(`Provider:\n  ${adapter.displayName}\n`);
                process.stdout.write(`Classification:\n  Passthrough\n`);
                process.stdout.write(`Reason:\n  ${decision.reason}\n`);
                process.stdout.write(`Binary:\n  ${resolution.resolvedBinary}\n`);
            }
            // ─── PASSTHROUGH MODE ───
            await this.executePassthrough(resolution.resolvedBinary, debugMode);
        }
        else {
            // ─── GATEWAY INTERCEPTION MODE ───
            if (debugMode) {
                process.stdout.write(`Wrapper Dispatcher\n`);
                process.stdout.write(`Provider:\n  ${adapter.displayName}\n`);
                process.stdout.write(`Classification:\n  Gateway\n`);
                process.stdout.write(`Reason:\n  ${decision.reason}\n`);
            }
            await this.executeGateway(resolution.resolvedBinary, debugMode);
        }
    }
    async executePassthrough(realBinary, debugMode) {
        const child = spawn(realBinary, this.args, {
            cwd: process.cwd(),
            env: process.env,
            stdio: "inherit"
        });
        if (debugMode) {
            // Under debug mode, log the exit code when child process finishes
            child.on("close", (code) => {
                process.stdout.write(`Exit Code:\n  ${code ?? 0}\n`);
            });
        }
        // Register signal forwarding
        const signals = ["SIGINT", "SIGTERM", "SIGQUIT", "SIGHUP"];
        if (process.platform !== "win32") {
            signals.push("SIGWINCH");
        }
        const handlers = new Map();
        for (const sig of signals) {
            const handler = () => {
                try {
                    child.kill(sig);
                }
                catch { }
            };
            handlers.set(sig, handler);
            process.on(sig, handler);
        }
        child.on("close", (code, signal) => {
            // Clean up signal handlers
            for (const [sig, handler] of handlers) {
                process.off(sig, handler);
            }
            if (code !== null) {
                process.exit(code);
            }
            else if (signal) {
                process.exit(128); // Standard signal exit code offset
            }
            else {
                process.exit(0);
            }
        });
        child.on("error", (err) => {
            process.stderr.write(`Failed to execute provider: ${err.message}\n`);
            process.exit(1);
        });
    }
    async executeGateway(realBinary, debugMode) {
        // Run gateway session in-process to avoid spawning overhead
        const ctx = createKernelContext(process.cwd(), process.cwd());
        // Extract prompt
        let originalPrompt = "";
        const promptArgs = this.args.filter(arg => !arg.startsWith("-"));
        if (promptArgs.length > 0) {
            originalPrompt = promptArgs.join(" ");
        }
        else {
            originalPrompt = "General workspace optimization";
        }
        // Import services directly or use runGatewaySession via SDK
        const { runGatewaySession } = await import("../sdk/index.js");
        if (debugMode) {
            try {
                const session = await runGatewaySession(ctx, this.providerId, originalPrompt, this.args);
                const metrics = session.metrics;
                process.stdout.write(`Retrieved:\n  ${metrics?.retrievedFiles ?? 0} files\n`);
                process.stdout.write(`Prompt Reduction:\n  ${metrics?.reductionPct ?? 0}%\n`);
                process.stdout.write(`Launching:\n  ${realBinary}\n`);
            }
            catch (err) {
                process.stderr.write(`Execution failed: ${err.message}\n`);
                process.exit(1);
            }
        }
        else {
            // Standard gateway invocation
            const opts = {
                workspace: process.cwd(),
                project: process.cwd(),
                json: false,
                verbose: false,
                quiet: false,
            };
            const cmdOpts = {
                provider: this.providerId,
                args: this.args,
            };
            try {
                await runGateway(opts, "run", cmdOpts);
            }
            catch (err) {
                process.stderr.write(`Execution failed: ${err.message}\n`);
                process.exit(1);
            }
        }
    }
}
