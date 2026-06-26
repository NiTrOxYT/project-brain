// ──────────────────────────────────────────────────────────────────────────────
// BUILD-049 — Provider Runtime — Health Monitor
// TTL-cached health checks. Offline providers skipped in negotiation.
// ──────────────────────────────────────────────────────────────────────────────

import { SDKProvider } from "./provider";
import { ProviderHealthReport } from "./types";

const DEFAULT_TTL_MS = 30_000; // 30 seconds

interface CachedHealth {
    report: ProviderHealthReport;
    cachedAt: number;
}

export class HealthMonitor {
    private readonly cache = new Map<string, CachedHealth>();

    constructor(private readonly ttlMs: number = DEFAULT_TTL_MS) {}

    /**
     * Check health for a single provider.
     * Uses cache if within TTL; otherwise fetches live.
     */
    async check(provider: SDKProvider): Promise<ProviderHealthReport> {
        const cached = this.cache.get(provider.id);
        if (cached && Date.now() - cached.cachedAt < this.ttlMs) {
            return cached.report;
        }

        let report: ProviderHealthReport;
        try {
            report = await provider.health();
        } catch (err: any) {
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
    async checkAll(providers: SDKProvider[]): Promise<Map<string, ProviderHealthReport>> {
        const results = new Map<string, ProviderHealthReport>();
        await Promise.all(
            providers.map(async p => {
                const report = await this.check(p);
                results.set(p.id, report);
            })
        );
        return results;
    }

    /** Invalidate cache for a specific provider. */
    invalidate(providerId: string): void {
        this.cache.delete(providerId);
    }

    /** Invalidate all cached health data. */
    invalidateAll(): void {
        this.cache.clear();
    }

    /** Return cached health without fetching. Returns undefined if not cached. */
    getCached(providerId: string): ProviderHealthReport | undefined {
        const cached = this.cache.get(providerId);
        if (!cached) return undefined;
        if (Date.now() - cached.cachedAt >= this.ttlMs) {
            this.cache.delete(providerId);
            return undefined;
        }
        return cached.report;
    }

    /** Count providers with Healthy status in cache. */
    countHealthy(): number {
        let count = 0;
        for (const [, cached] of this.cache) {
            if (cached.report.status === "Healthy") count++;
        }
        return count;
    }
}
