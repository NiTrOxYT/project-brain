// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — AI Gateway — Adapter Registry Shim
// Delegates static lookup calls directly to the Kernel ServiceRegistry primitive.
// ──────────────────────────────────────────────────────────────────────────────
import { globalProviderRegistry } from "../kernel/index.js";
import { ProviderNotInstalledError } from "./errors.js";
/**
 * AdapterRegistry acts as a compatibility shim delegating calls
 * to the generic kernel ServiceRegistry.
 */
export class AdapterRegistry {
    static registry = globalProviderRegistry;
    // ── Registration ──────────────────────────────────────────────────────────
    static register(adapter) {
        AdapterRegistry.registry.register(adapter);
    }
    // ── Lookup ────────────────────────────────────────────────────────────────
    static lookup(id) {
        try {
            return AdapterRegistry.registry.lookup(id);
        }
        catch {
            throw new ProviderNotInstalledError(id);
        }
    }
    static has(id) {
        return AdapterRegistry.registry.has(id);
    }
    static list() {
        return AdapterRegistry.registry.list();
    }
    static ids() {
        return AdapterRegistry.registry.list().map(a => a.id);
    }
    static unregister(id) {
        AdapterRegistry.registry.unregister(id);
    }
    static clear() {
        AdapterRegistry.registry.clear();
    }
}
