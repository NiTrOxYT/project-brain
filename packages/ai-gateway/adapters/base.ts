// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Base Provider Adapter
// Handles PTY spawn, stream forwarding, signal propagation, loop guard.
// Concrete adapters extend this and implement buildArgs() + metadata().
// ──────────────────────────────────────────────────────────────────────────────

import { execFile, spawn }  from "child_process";
import { promisify }        from "util";
import fs                  from "fs";
import path                from "path";
import type {
    ProviderAdapter,
    ProviderAdapterMetadata,
    ProviderHealthStatus,
    ProviderProcess,
    LaunchOptions,
    ExitResult,
} from "../types.js";
import type { ProviderCapabilities } from "../../provider-bridge/types.js";
import {
    ProviderDetectionError,
    ProviderLaunchError,
    WrapperLoopError,
} from "../errors.js";
import { GlobalPaths } from "../global-paths.js";
import { Plugin, PluginKind } from "../../kernel/index.js";
import { AdapterRegistry } from "../adapter-registry.js";
import { ProviderResolverService } from "../provider-resolver.js";
import { classifyProviderInvocation, type InvocationDecision } from "../invocation-classifier.js";
import { LaunchStrategyRegistry } from "../launch-strategy.js";
import { TerminalStateManager } from "../terminal-state.js";

const execFileAsync = promisify(execFile);

// ─── Stream helper ────────────────────────────────────────────────────────────

async function* streamChunks(
    stream: NodeJS.ReadableStream
): AsyncIterable<string> {
    for await (const chunk of stream) {
        yield (chunk as Buffer).toString("utf8");
    }
}

// ─── Base class ───────────────────────────────────────────────────────────────

export abstract class BaseProviderAdapter implements ProviderAdapter, Plugin {
    abstract readonly id:          string;
    abstract readonly displayName: string;
    abstract readonly version:     string;

    readonly kind: PluginKind = "provider";
    readonly apiVersion = "1.0.0";
    readonly pluginVersion = "1.0.0";
    readonly minimumKernelVersion = "0.1.0";

    async initialize(): Promise<void> {
        AdapterRegistry.register(this);
    }

    async shutdown(): Promise<void> {
        AdapterRegistry.unregister(this.id);
    }

    /** The binary name to search for in PATH (e.g. "claude", "codex"). */
    abstract readonly binaryName: string;

    /** Build the argument list for this provider given launch options. */
    protected abstract buildArgs(opts: LaunchOptions): string[];

    abstract metadata(): ProviderAdapterMetadata;

    capabilities(): ProviderAdapterMetadata["capabilities"] {
        return this.metadata().capabilities;
    }

    providerCapabilities(): ProviderCapabilities {
        return {
            launchWrapper:   true,
            promptBridge:    false,
            responseBridge:  false,
            toolBridge:      false,
            workspaceBridge: false,
            mcpBridge:       false,
            apiBridge:       false,
            contextProvider: false
        };
    }

    passthroughCommands(): string[] {
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

    gatewayCommands(): string[] {
        return [];
    }

    supportsInteractiveTTY(): boolean {
        return true;
    }

    classifyInvocation(argv: string[]): InvocationDecision {
        return classifyProviderInvocation(argv, this.passthroughCommands(), this.gatewayCommands());
    }

    // ── Detection ─────────────────────────────────────────────────────────────

    async detect(): Promise<boolean> {
        const resolver = new ProviderResolverService();
        const res = await resolver.resolve(this.id);
        return res.executableExists && res.executable;
    }

    /**
     * Resolve the absolute path of the real provider binary.
     * Delegates to ProviderResolverService.
     */
    async resolvedBinaryPath(): Promise<string> {
        const resolver = new ProviderResolverService();
        const res = await resolver.resolve(this.id);
        if (!res.resolvedBinary) {
            throw new ProviderDetectionError(
                this.id,
                `${this.binaryName} not found in PATH or manifest`
            );
        }
        return res.resolvedBinary;
    }

    // ── Health ────────────────────────────────────────────────────────────────

    async health(): Promise<ProviderHealthStatus> {
        const resolver = new ProviderResolverService();
        return await resolver.health(this.id);
    }

    // ── Launch ────────────────────────────────────────────────────────────────

    /**
     * Spawn the real provider binary using the selected LaunchStrategy.
     */
    async launch(opts: LaunchOptions): Promise<ProviderProcess> {
        const stateManager = new TerminalStateManager();
        stateManager.capture();

        try {
            const strategy = LaunchStrategyRegistry.select(this, opts);
            const processInstance = await strategy.launch(this, opts);

            const originalWait = processInstance.wait;
            processInstance.wait = async (): Promise<ExitResult> => {
                try {
                    const res = await originalWait();
                    return res;
                } finally {
                    stateManager.restore();
                }
            };

            return processInstance;
        } catch (err) {
            stateManager.restore();
            throw err;
        }
    }
}
