// ──────────────────────────────────────────────────────────────────────────────
// BUILD-049 — Provider Runtime — Metrics Collector
// Persists per-execution metrics and computes cumulative aggregates.
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { ProviderMetrics, CumulativeMetrics } from "./types.js";

export class MetricsCollector {
    private readonly metricsRoot: string;
    private readonly buffer: ProviderMetrics[] = [];
    /** providerId → cumulative running totals */
    private readonly cumulative = new Map<string, CumulativeMetrics>();

    constructor(workspaceRoot: string) {
        this.metricsRoot = path.join(workspaceRoot, ".brain", "providers", "metrics");
        this.ensureDirectory(this.metricsRoot);
    }

    /**
     * Record a single execution's metrics.
     * Persists to daily JSONL file + updates in-memory cumulative.
     */
    record(metrics: ProviderMetrics): void {
        this.buffer.push(metrics);
        this.updateCumulative(metrics);
        this.persistMetrics(metrics);
    }

    /**
     * Aggregate cumulative metrics.
     * If providerId given, returns only that provider's aggregation.
     * If omitted, returns all providers.
     */
    aggregate(providerId?: string): CumulativeMetrics[] {
        if (providerId) {
            const m = this.cumulative.get(providerId);
            return m ? [m] : [];
        }
        return Array.from(this.cumulative.values());
    }

    /**
     * Reset in-memory accumulator (does not delete persisted files).
     */
    reset(): void {
        this.buffer.length = 0;
        this.cumulative.clear();
    }

    get recordCount(): number {
        return this.buffer.length;
    }

    // ─── Internal ───────────────────────────────────────────────────────────

    private updateCumulative(m: ProviderMetrics): void {
        const key = m.provider;
        const existing = this.cumulative.get(key);

        if (!existing) {
            this.cumulative.set(key, {
                provider: m.provider,
                model: m.model,
                requestCount: 1,
                totalPromptTokens: m.promptTokens,
                totalCompletionTokens: m.completionTokens,
                totalEstimatedCost: m.estimatedCost,
                averageLatencyMs: m.latencyMs,
                totalArtifactsGenerated: m.artifactsGenerated,
                totalFallbackCount: m.fallbackCount,
                lastUpdated: new Date().toISOString()
            });
        } else {
            const n = existing.requestCount + 1;
            existing.requestCount = n;
            existing.totalPromptTokens += m.promptTokens;
            existing.totalCompletionTokens += m.completionTokens;
            existing.totalEstimatedCost += m.estimatedCost;
            // Rolling average latency
            existing.averageLatencyMs = parseFloat(
                ((existing.averageLatencyMs * (n - 1) + m.latencyMs) / n).toFixed(2)
            );
            existing.totalArtifactsGenerated += m.artifactsGenerated;
            existing.totalFallbackCount += m.fallbackCount;
            existing.lastUpdated = new Date().toISOString();
            // Update model to most recent
            existing.model = m.model;
        }
    }

    private persistMetrics(m: ProviderMetrics): void {
        try {
            const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
            const file = path.join(this.metricsRoot, `${date}.jsonl`);
            fs.appendFileSync(file, JSON.stringify(m) + "\n");
        } catch {}
    }

    private ensureDirectory(dir: string): void {
        try {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        } catch {}
    }
}
