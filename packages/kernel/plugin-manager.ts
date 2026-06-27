// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — Kernel — Universal Plugin Manager
// Orchestrates capability discovery and registration for modular components.
// ──────────────────────────────────────────────────────────────────────────────

export type PluginKind =
    | "provider"
    | "storage"
    | "search"
    | "token-estimator"
    | "optimizer"
    | "ranking"
    | "compression"
    | "learning"
    | "diagnostics";

export interface Plugin {
    readonly id: string;
    readonly kind: PluginKind;
    readonly apiVersion: string;
    readonly pluginVersion: string;
    readonly minimumKernelVersion: string;
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
}

export class PluginManager {
    private readonly plugins = new Map<string, Plugin>();

    async register(plugin: Plugin): Promise<void> {
        await plugin.initialize();
        this.plugins.set(plugin.id, plugin);
    }

    registerSync(plugin: Plugin): void {
        plugin.initialize().catch(() => {});
        this.plugins.set(plugin.id, plugin);
    }

    async unregister(id: string): Promise<void> {
        const plugin = this.plugins.get(id);
        if (plugin) {
            await plugin.shutdown();
            this.plugins.delete(id);
        }
    }

    list(kind?: PluginKind): Plugin[] {
        const all = Array.from(this.plugins.values());
        return kind ? all.filter(p => p.kind === kind) : all;
    }
}
// ──────────────────────────────────────────────────────────────────────────────
// Capability Discovery Interface
// ──────────────────────────────────────────────────────────────────────────────
export interface ProviderCapabilities {
    readonly supportsStreaming: boolean;
    readonly supportsImages:    boolean;
    readonly supportsTools:     boolean;
    readonly supportsResume:    boolean;
    readonly supportsEdits:     boolean;
    readonly supportsThinking:  boolean;
    readonly supportsMCP:       boolean;
}
