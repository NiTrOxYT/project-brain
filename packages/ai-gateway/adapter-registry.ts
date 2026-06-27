// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — AI Gateway — Adapter Registry Shim
// Delegates static lookup calls directly to the Kernel ServiceRegistry primitive.
// ──────────────────────────────────────────────────────────────────────────────

import type { ProviderAdapter } from "./types.js";
import { globalProviderRegistry } from "../kernel/index.js";
import { ProviderNotInstalledError } from "./errors.js";

/**
 * AdapterRegistry acts as a compatibility shim delegating calls
 * to the generic kernel ServiceRegistry.
 */
export class AdapterRegistry {
    private static readonly registry = globalProviderRegistry;

    // ── Registration ──────────────────────────────────────────────────────────

    static register(adapter: ProviderAdapter): void {
        AdapterRegistry.registry.register(adapter);
    }

    // ── Lookup ────────────────────────────────────────────────────────────────

    static lookup(id: string): ProviderAdapter {
        try {
            return AdapterRegistry.registry.lookup(id);
        } catch {
            throw new ProviderNotInstalledError(id);
        }
    }

    static has(id: string): boolean {
        return AdapterRegistry.registry.has(id);
    }

    static list(): ProviderAdapter[] {
        return AdapterRegistry.registry.list();
    }

    static ids(): string[] {
        return AdapterRegistry.registry.list().map(a => a.id);
    }

    static unregister(id: string): void {
        AdapterRegistry.registry.unregister(id);
    }

    static clear(): void {
        AdapterRegistry.registry.clear();
    }
}
