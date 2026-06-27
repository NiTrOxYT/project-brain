// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — Kernel — Generic Service Registry
// Generic registry pattern replacing individual custom registries.
// ──────────────────────────────────────────────────────────────────────────────

export class ServiceRegistry<T extends { id: string }> {
    private readonly services = new Map<string, T>();

    register(service: T): void {
        this.services.set(service.id, service);
    }

    lookup(id: string): T {
        const service = this.services.get(id);
        if (!service) {
            throw new Error(`Service "${id}" not found in registry.`);
        }
        return service;
    }

    has(id: string): boolean {
        return this.services.has(id);
    }

    list(): T[] {
        return Array.from(this.services.values());
    }

    unregister(id: string): void {
        this.services.delete(id);
    }

    clear(): void {
        this.services.clear();
    }
}

export const globalProviderRegistry  = new ServiceRegistry<any>();
export const globalEstimatorRegistry = new ServiceRegistry<any>();
export const globalSearchRegistry    = new ServiceRegistry<any>();
