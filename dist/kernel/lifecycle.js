// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — Kernel — Lifecycle Manager
// Ensures components boot and shutdown in stable sequential dependency order.
// ──────────────────────────────────────────────────────────────────────────────
export class LifecycleManager {
    services = [];
    register(service) {
        this.services.push(service);
    }
    async boot() {
        for (const s of this.services) {
            await s.initialize();
            if (s.start) {
                await s.start();
            }
        }
    }
    async shutdown() {
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
