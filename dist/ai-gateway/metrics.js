// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Metrics Store
// Persists aggregate cross-provider stats at ~/.project-brain/metrics/aggregate.json
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import { MetricsStoreError } from "./errors.js";
import { GlobalPaths } from "./global-paths.js";
const EMPTY_METRICS = {
    totalSessions: 0,
    totalTokensSaved: 0,
    totalCostSaved: 0,
    avgReductionPct: 0,
    avgRetrievalLatency: 0,
    avgOptimizeLatency: 0,
    avgSessionDuration: 0,
    learningPatterns: 0,
    perProvider: [],
    lastUpdated: new Date(0).toISOString(),
};
export class GatewayMetricsStore {
    paths;
    constructor(paths) {
        this.paths = paths ?? new GlobalPaths();
    }
    // ── Read ──────────────────────────────────────────────────────────────────
    load() {
        if (!fs.existsSync(this.paths.aggregateMetricsPath)) {
            return structuredClone(EMPTY_METRICS);
        }
        try {
            const raw = fs.readFileSync(this.paths.aggregateMetricsPath, "utf8");
            return JSON.parse(raw);
        }
        catch (err) {
            throw new MetricsStoreError(`Failed to load aggregate metrics: ${err.message}`);
        }
    }
    // ── Write ─────────────────────────────────────────────────────────────────
    /**
     * Update aggregate metrics from a completed session.
     * Uses incremental running-average formula to avoid re-reading all sessions.
     */
    update(session, learningPatternsAdded = 0) {
        try {
            const current = this.load();
            const updated = this.applySession(current, session, learningPatternsAdded);
            this.persist(updated);
        }
        catch (err) {
            if (err instanceof MetricsStoreError)
                throw err;
            throw new MetricsStoreError(`Failed to update metrics: ${err.message}`);
        }
    }
    // ── Helpers ───────────────────────────────────────────────────────────────
    applySession(current, session, learningPatternsAdded) {
        const m = session.metrics;
        const n = current.totalSessions;
        // Running-average helper
        const runAvg = (oldAvg, newVal, newN) => newN === 1 ? newVal : (oldAvg * (newN - 1) + newVal) / newN;
        const newN = n + 1;
        const newTotal = {
            totalSessions: newN,
            totalTokensSaved: current.totalTokensSaved + (m ? Math.max(0, m.promptTokens - m.optimizedTokens) : 0),
            totalCostSaved: current.totalCostSaved + (m ? (this.estimateCostSaved(m.promptTokens, m.optimizedTokens)) : 0),
            avgReductionPct: m ? runAvg(current.avgReductionPct, m.reductionPct, newN) : current.avgReductionPct,
            avgRetrievalLatency: m ? runAvg(current.avgRetrievalLatency, m.latencyMs, newN) : current.avgRetrievalLatency,
            avgOptimizeLatency: current.avgOptimizeLatency, // updated by optimizer phase
            avgSessionDuration: this.computeSessionDuration(current, session, newN),
            learningPatterns: current.learningPatterns + learningPatternsAdded,
            perProvider: this.updateProviderStats(current.perProvider, session),
            lastUpdated: new Date().toISOString(),
        };
        return newTotal;
    }
    estimateCostSaved(promptTokens, optimizedTokens) {
        const saved = promptTokens - optimizedTokens;
        if (saved <= 0)
            return 0;
        // Conservative blended rate: $0.003 per 1K tokens
        return (saved / 1000) * 0.003;
    }
    computeSessionDuration(current, session, newN) {
        if (!session.completedAt)
            return current.avgSessionDuration;
        const durationMs = new Date(session.completedAt).getTime() -
            new Date(session.startedAt).getTime();
        return newN === 1
            ? durationMs
            : (current.avgSessionDuration * (newN - 1) + durationMs) / newN;
    }
    updateProviderStats(existing, session) {
        const id = session.providerId;
        const m = session.metrics;
        const idx = existing.findIndex(p => p.providerId === id);
        const saved = m ? (m.promptTokens - m.optimizedTokens) : 0;
        const cost = m ? this.estimateCostSaved(m.promptTokens, m.optimizedTokens) : 0;
        const newN = (idx === -1 ? 0 : existing[idx].sessionCount) + 1;
        const runAvg = (oldAvg, newVal, n) => n === 1 ? newVal : (oldAvg * (n - 1) + newVal) / n;
        if (idx === -1) {
            return [
                ...existing,
                {
                    providerId: id,
                    sessionCount: 1,
                    totalTokensSaved: saved,
                    totalCostSaved: cost,
                    avgReductionPct: m?.reductionPct ?? 0,
                    avgLatencyMs: m?.latencyMs ?? 0,
                },
            ];
        }
        const prev = existing[idx];
        const updated = {
            providerId: id,
            sessionCount: newN,
            totalTokensSaved: prev.totalTokensSaved + saved,
            totalCostSaved: prev.totalCostSaved + cost,
            avgReductionPct: m ? runAvg(prev.avgReductionPct, m.reductionPct, newN) : prev.avgReductionPct,
            avgLatencyMs: m ? runAvg(prev.avgLatencyMs, m.latencyMs, newN) : prev.avgLatencyMs,
        };
        return existing.map((p, i) => (i === idx ? updated : p));
    }
    persist(metrics) {
        fs.mkdirSync(this.paths.metricsDir, { recursive: true });
        fs.writeFileSync(this.paths.aggregateMetricsPath, JSON.stringify(metrics, null, 2), "utf8");
    }
    // ── Aggregate token savings field ─────────────────────────────────────────
    /**
     * Return the saved-token count used across all sessions.
     * Convenience helper for CLI display.
     */
    savedTokens(metrics) {
        const m = metrics ?? this.load();
        return m.totalTokensSaved;
    }
}
