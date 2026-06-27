import fs from "fs/promises";
import path from "path";
import { SynchronizationStatistics, IncrementalCompilationMetrics } from "./types.js";
import { StoragePaths } from "../kernel/paths.js";

const DEFAULT_STATS: SynchronizationStatistics = {
    totalSyncs: 0,
    totalDurationMs: 0,
    averageSyncDurationMs: 0,
    averageDirtyFiles: 0,
    averageRebuiltSymbols: 0,
    averageRebuiltGraphNodes: 0,
    averagePatchSizeBytes: 0,
    cacheHitRatio: 0,
    rebuildPercentageAverage: 0
};

export class SynchronizationMetricsTracker {
    private readonly metricsPath: string;
    private stats: SynchronizationStatistics = { ...DEFAULT_STATS };
    private loaded = false;

    constructor(workspaceRoot: string) {
        this.metricsPath = new StoragePaths(workspaceRoot).syncMetricsPath;
    }

    async load(): Promise<void> {
        try {
            const raw = await fs.readFile(this.metricsPath, "utf8");
            this.stats = { ...DEFAULT_STATS, ...JSON.parse(raw) };
        } catch {
            this.stats = { ...DEFAULT_STATS };
        }
        this.loaded = true;
    }

    async record(metrics: IncrementalCompilationMetrics, cacheHit: boolean): Promise<void> {
        if (!this.loaded) await this.load();

        this.stats.totalSyncs++;
        this.stats.totalDurationMs += metrics.totalDurationMs;

        const n = this.stats.totalSyncs;
        this.stats.averageSyncDurationMs =
            (this.stats.averageSyncDurationMs * (n - 1) + metrics.totalDurationMs) / n;

        this.stats.averageDirtyFiles =
            (this.stats.averageDirtyFiles * (n - 1) + metrics.dirtyFilesCount) / n;

        this.stats.averageRebuiltSymbols =
            (this.stats.averageRebuiltSymbols * (n - 1) + metrics.rebuiltSymbolsCount) / n;

        this.stats.averageRebuiltGraphNodes =
            (this.stats.averageRebuiltGraphNodes * (n - 1) + metrics.rebuiltGraphNodesCount) / n;

        this.stats.averagePatchSizeBytes =
            (this.stats.averagePatchSizeBytes * (n - 1) + metrics.patchSizeBytes) / n;

        const hits = this.stats.cacheHitRatio * (n - 1) + (cacheHit ? 1 : 0);
        this.stats.cacheHitRatio = hits / n;

        this.stats.rebuildPercentageAverage =
            (this.stats.rebuildPercentageAverage * (n - 1) + metrics.incrementalRebuildPercentage) / n;

        await this.save();
    }

    async get(): Promise<SynchronizationStatistics> {
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
            await fs.mkdir(path.dirname(this.metricsPath), { recursive: true });
            await fs.writeFile(
                this.metricsPath,
                JSON.stringify(this.stats, null, 2),
                "utf8"
            );
        } catch {
            // Best-effort
        }
    }
}
