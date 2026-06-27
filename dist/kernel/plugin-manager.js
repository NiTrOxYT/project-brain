// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — Kernel — Universal Plugin Manager
// Orchestrates capability discovery and registration for modular components.
// ──────────────────────────────────────────────────────────────────────────────
export class PluginManager {
    plugins = new Map();
    async register(plugin) {
        await plugin.initialize();
        this.plugins.set(plugin.id, plugin);
    }
    registerSync(plugin) {
        plugin.initialize().catch(() => { });
        this.plugins.set(plugin.id, plugin);
    }
    async unregister(id) {
        const plugin = this.plugins.get(id);
        if (plugin) {
            await plugin.shutdown();
            this.plugins.delete(id);
        }
    }
    list(kind) {
        const all = Array.from(this.plugins.values());
        return kind ? all.filter(p => p.kind === kind) : all;
    }
}
