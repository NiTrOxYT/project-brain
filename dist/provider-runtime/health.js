// ──────────────────────────────────────────────────────────────────────────────
// BUILD-049 — Provider Runtime — Health Monitor
// TTL-cached health checks. Offline providers skipped in negotiation.
// ──────────────────────────────────────────────────────────────────────────────
const DEFAULT_TTL_MS = 30_000; // 30 seconds
export class HealthMonitor {
    ttlMs;
    cache = new Map();
    constructor(ttlMs = DEFAULT_TTL_MS) {
        this.ttlMs = ttlMs;
    }
    /**
     * Check health for a single provider.
     * Uses cache if within TTL; otherwise fetches live.
     */
    async check(provider) {
        const cached = this.cache.get(provider.id);
        if (cached && Date.now() - cached.cachedAt < this.ttlMs) {
            return cached.report;
        }
        let report;
        try {
            report = await provider.health();
        }
        catch (err) {
            report = {
                status: "Unavailable",
                authenticated: false,
                installed: false,
                latencyMs: 0,
                lastHeartbeat: new Date().toISOString(),
                version: "unknown",
                details: { error: err.message }
            };
        }
        this.cache.set(provider.id, { report, cachedAt: Date.now() });
        return report;
    }
    /**
     * Check health for all given providers in parallel.
     * Returns map of providerId → ProviderHealthReport.
     */
    async checkAll(providers) {
        const results = new Map();
        await Promise.all(providers.map(async (p) => {
            const report = await this.check(p);
            results.set(p.id, report);
        }));
        return results;
    }
    /** Invalidate cache for a specific provider. */
    invalidate(providerId) {
        this.cache.delete(providerId);
    }
    /** Invalidate all cached health data. */
    invalidateAll() {
        this.cache.clear();
    }
    /** Return cached health without fetching. Returns undefined if not cached. */
    getCached(providerId) {
        const cached = this.cache.get(providerId);
        if (!cached)
            return undefined;
        if (Date.now() - cached.cachedAt >= this.ttlMs) {
            this.cache.delete(providerId);
            return undefined;
        }
        return cached.report;
    }
    /** Count providers with Healthy status in cache. */
    countHealthy() {
        let count = 0;
        for (const [, cached] of this.cache) {
            if (cached.report.status === "Healthy")
                count++;
        }
        return count;
    }
}
