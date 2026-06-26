// ──────────────────────────────────────────────────────────────────────────────
// BUILD-049 — Provider Runtime — Provider Interface & Base Class
// ──────────────────────────────────────────────────────────────────────────────
// ─── BaseSDKProvider ──────────────────────────────────────────────────────────
/**
 * Abstract base implementing shared boilerplate.
 * Concrete providers extend this and implement:
 *   - metadata()
 *   - profile()
 *   - execute()
 * Other methods have sensible defaults.
 */
export class BaseSDKProvider {
    capabilities() {
        return this.metadata().supportedCapabilities;
    }
    supportsCapability(capability) {
        return this.capabilities().includes(capability);
    }
    async health() {
        return {
            status: "Healthy",
            authenticated: true,
            installed: true,
            latencyMs: 0,
            lastHeartbeat: new Date().toISOString(),
            version: this.metadata().version
        };
    }
    async pause(_taskId) { }
    async resume(_taskId) { }
    async cancel(_taskId) { }
    async shutdown() { }
}
