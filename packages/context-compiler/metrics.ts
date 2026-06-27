// ──────────────────────────────────────────────────────────────────────────────
// BUILD-054 — Context Compiler — Metrics
// Tracks compilation statistics: cache hit/miss rates, token savings,
// average compile durations, and last compilation timestamps.
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs/promises";
import path from "path";
import { SnapshotStatistics, CompilationMetrics } from "./types.js";
import { StoragePaths } from "../kernel/paths.js";

const DEFAULT_STATS: SnapshotStatistics = {
    totalSnapshots: 0,
    totalCompilations: 0,
    cacheHits: 0,
    cacheMisses: 0,
    incrementalCompiles: 0,
    fullCompiles: 0,
    averageCompilationMs: 0,
    averageTokens: 0,
    tokenSavings: 0,
    lastCompilationAt: undefined,
    lastSnapshotId: undefined
};

export class SnapshotMetricsTracker {
    private readonly statsPath: string;
    private stats: SnapshotStatistics = { ...DEFAULT_STATS };
    private loaded = false;

    constructor(workspaceRoot: string) {
        this.statsPath = new StoragePaths(workspaceRoot).compilerMetricsPath;
    }

    async load(): Promise<void> {
        try {
            const raw = await fs.readFile(this.statsPath, "utf8");
            this.stats = { ...DEFAULT_STATS, ...JSON.parse(raw) };
        } catch {
            this.stats = { ...DEFAULT_STATS };
        }
        this.loaded = true;
    }

    async record(metrics: CompilationMetrics, snapshotId: string): Promise<void> {
        if (!this.loaded) await this.load();

        this.stats.totalCompilations++;
        this.stats.lastCompilationAt = new Date().toISOString();
        this.stats.lastSnapshotId = snapshotId;

        if (metrics.cacheHit) {
            this.stats.cacheHits++;
        } else {
            this.stats.cacheMisses++;
            this.stats.totalSnapshots++;

            if (metrics.incremental) {
                this.stats.incrementalCompiles++;
            } else {
                this.stats.fullCompiles++;
            }

            // Rolling average compile duration (only for real compiles)
            const previousAvg = this.stats.averageCompilationMs;
            const n = this.stats.totalSnapshots;
            this.stats.averageCompilationMs =
                (previousAvg * (n - 1) + metrics.totalDurationMs) / n;

            // Rolling average tokens
            const previousAvgTokens = this.stats.averageTokens;
            this.stats.averageTokens =
                (previousAvgTokens * (n - 1) + metrics.estimatedTokens) / n;
        }

        await this.save();
    }

    async recordTokenSavings(tokensSaved: number): Promise<void> {
        if (!this.loaded) await this.load();
        this.stats.tokenSavings += tokensSaved;
        await this.save();
    }

    async get(): Promise<SnapshotStatistics> {
        if (!this.loaded) await this.load();
        return { ...this.stats };
    }

    async reset(): Promise<void> {
        this.stats = { ...DEFAULT_STATS };
        this.loaded = true;
        await this.save();
    }

    private async save(): Promise<void> {
        try {
            await fs.mkdir(path.dirname(this.statsPath), { recursive: true });
            await fs.writeFile(
                this.statsPath,
                JSON.stringify(this.stats, null, 2),
                "utf8"
            );
        } catch {
            // Best-effort
        }
    }
}
