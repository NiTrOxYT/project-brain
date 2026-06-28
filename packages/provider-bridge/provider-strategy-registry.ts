// ──────────────────────────────────────────────────────────────────────────────
// BUILD-069 — Provider Strategy Registry
// ──────────────────────────────────────────────────────────────────────────────

import type { ProviderManifest } from "./provider-manifest.js";
import type { ProviderProfile } from "./provider-profile.js";
import type { ProviderConfiguration } from "./discovery.js";
import type { ProviderIntegrationMode } from "./provider-integration.js";

export interface ProviderIntegrationContext {
    manifest: ProviderManifest;
    profile: ProviderProfile;
    configuration: ProviderConfiguration;
    activeConfigPath: string;
    workspaceRoot?: string;
    options?: {
        transport: "stdio" | "http";
        port?: number;
    };
}

export interface ProviderIntegrationStrategy {
    readonly mode: ProviderIntegrationMode;
    install(context: ProviderIntegrationContext): Promise<{ success: boolean; error?: string }>;
    uninstall(context: ProviderIntegrationContext): Promise<{ success: boolean; error?: string }>;
    verify(context: ProviderIntegrationContext): Promise<{ success: boolean; errors: string[] }>;
    repair(context: ProviderIntegrationContext): Promise<{ success: boolean; error?: string }>;
}

export class ProviderStrategyRegistry {
    private static strategies: Map<ProviderIntegrationMode, ProviderIntegrationStrategy> = new Map();

    static register(strategy: ProviderIntegrationStrategy): void {
        if (!strategy || !strategy.mode) {
            throw new Error("Invalid integration strategy. Must declare a mode.");
        }
        if (this.strategies.has(strategy.mode)) {
            throw new Error(`Duplicate strategy registration: A strategy for mode "${strategy.mode}" is already registered.`);
        }
        this.strategies.set(strategy.mode, strategy);
    }

    static unregister(mode: ProviderIntegrationMode): void {
        this.strategies.delete(mode);
    }

    static resolve(mode: ProviderIntegrationMode): ProviderIntegrationStrategy {
        const strategy = this.strategies.get(mode);
        if (!strategy) {
            throw new Error(`Strategy Resolution Failed: No integration strategy is registered for mode "${mode}".`);
        }
        return strategy;
    }

    static availableStrategies(): ProviderIntegrationMode[] {
        return Array.from(this.strategies.keys());
    }

    static clear(): void {
        this.strategies.clear();
    }
}
