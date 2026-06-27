// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — Kernel — Generic Service Registry
// Generic registry pattern replacing individual custom registries.
// ──────────────────────────────────────────────────────────────────────────────
export class ServiceRegistry {
    services = new Map();
    register(service) {
        this.services.set(service.id, service);
    }
    lookup(id) {
        const service = this.services.get(id);
        if (!service) {
            throw new Error(`Service "${id}" not found in registry.`);
        }
        return service;
    }
    has(id) {
        return this.services.has(id);
    }
    list() {
        return Array.from(this.services.values());
    }
    unregister(id) {
        this.services.delete(id);
    }
    clear() {
        this.services.clear();
    }
}
export const globalProviderRegistry = new ServiceRegistry();
export const globalEstimatorRegistry = new ServiceRegistry();
export const globalSearchRegistry = new ServiceRegistry();
