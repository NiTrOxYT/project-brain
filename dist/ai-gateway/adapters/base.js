// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Base Provider Adapter
// Handles PTY spawn, stream forwarding, signal propagation, loop guard.
// Concrete adapters extend this and implement buildArgs() + metadata().
// ──────────────────────────────────────────────────────────────────────────────
import { execFile } from "child_process";
import { promisify } from "util";
import { ProviderDetectionError, } from "../errors.js";
import { AdapterRegistry } from "../adapter-registry.js";
import { ProviderResolverService } from "../provider-resolver.js";
import { classifyProviderInvocation } from "../invocation-classifier.js";
import { LaunchStrategyRegistry } from "../launch-strategy.js";
import { TerminalStateManager } from "../terminal-state.js";
const execFileAsync = promisify(execFile);
// ─── Stream helper ────────────────────────────────────────────────────────────
async function* streamChunks(stream) {
    for await (const chunk of stream) {
        yield chunk.toString("utf8");
    }
}
// ─── Base class ───────────────────────────────────────────────────────────────
export class BaseProviderAdapter {
    kind = "provider";
    apiVersion = "1.0.0";
    pluginVersion = "1.0.0";
    minimumKernelVersion = "0.1.0";
    async initialize() {
        AdapterRegistry.register(this);
    }
    async shutdown() {
        AdapterRegistry.unregister(this.id);
    }
    capabilities() {
        return this.metadata().capabilities;
    }
    providerCapabilities() {
        return {
            launchWrapper: true,
            promptBridge: false,
            responseBridge: false,
            toolBridge: false,
            workspaceBridge: false,
            mcpBridge: false,
            apiBridge: false,
            contextProvider: false
        };
    }
    passthroughCommands() {
        return [
            "--version", "-v",
            "--help", "-h", "help",
            "login", "logout",
            "auth", "authenticate",
            "config", "configure",
            "doctor", "diagnostics",
            "update", "upgrade",
            "install", "uninstall",
            "list", "status",
            "completion", "shell-completion",
            "shell", "init",
            "models", "whoami"
        ];
    }
    gatewayCommands() {
        return [];
    }
    supportsInteractiveTTY() {
        return true;
    }
    classifyInvocation(argv) {
        return classifyProviderInvocation(argv, this.passthroughCommands(), this.gatewayCommands());
    }
    // ── Detection ─────────────────────────────────────────────────────────────
    async detect() {
        const resolver = new ProviderResolverService();
        const res = await resolver.resolve(this.id);
        return res.executableExists && res.executable;
    }
    /**
     * Resolve the absolute path of the real provider binary.
     * Delegates to ProviderResolverService.
     */
    async resolvedBinaryPath() {
        const resolver = new ProviderResolverService();
        const res = await resolver.resolve(this.id);
        if (!res.resolvedBinary) {
            throw new ProviderDetectionError(this.id, `${this.binaryName} not found in PATH or manifest`);
        }
        return res.resolvedBinary;
    }
    // ── Health ────────────────────────────────────────────────────────────────
    async health() {
        const resolver = new ProviderResolverService();
        return await resolver.health(this.id);
    }
    // ── Launch ────────────────────────────────────────────────────────────────
    /**
     * Spawn the real provider binary using the selected LaunchStrategy.
     */
    async launch(opts) {
        const stateManager = new TerminalStateManager();
        stateManager.capture();
        try {
            const strategy = LaunchStrategyRegistry.select(this, opts);
            const processInstance = await strategy.launch(this, opts);
            const originalWait = processInstance.wait;
            processInstance.wait = async () => {
                try {
                    const res = await originalWait();
                    return res;
                }
                finally {
                    stateManager.restore();
                }
            };
            return processInstance;
        }
        catch (err) {
            stateManager.restore();
            throw err;
        }
    }
}
