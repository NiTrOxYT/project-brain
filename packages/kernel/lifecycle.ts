// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — Kernel — Lifecycle Manager
// Ensures components boot and shutdown in stable sequential dependency order.
// ──────────────────────────────────────────────────────────────────────────────

export interface ManagedService {
    initialize(): Promise<void>;
    start?(): Promise<void>;
    stop?(): Promise<void>;
    dispose?(): Promise<void>;
}

export class LifecycleManager {
    private readonly services: ManagedService[] = [];

    register(service: ManagedService): void {
        this.services.push(service);
    }

    async boot(): Promise<void> {
        for (const s of this.services) {
            await s.initialize();
            if (s.start) {
                await s.start();
            }
        }
    }

    async shutdown(): Promise<void> {
        for (const s of [...this.services].reverse()) {
            if (s.stop) {
                await s.stop();
            }
            if (s.dispose) {
                await s.dispose();
            }
        }
    }
}
