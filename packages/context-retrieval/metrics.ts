import fs from "fs/promises";
import path from "path";
import { RetrievalStatistics, RetrievalMetrics } from "./types";

const DEFAULT_STATS: RetrievalStatistics = {
    totalRetrievals: 0,
    averageDurationMs: 0,
    averageFilesRetrieved: 0,
    averageSymbolsRetrieved: 0,
    averageTokens: 0,
    cacheHitRate: 0,
    compressionRatioAverage: 0
};

export class RetrievalMetricsTracker {
    private readonly statsPath: string;
    private stats: RetrievalStatistics = { ...DEFAULT_STATS };
    private loaded = false;

    constructor(workspaceRoot: string) {
        this.statsPath = path.join(
            workspaceRoot, ".brain", "context", "retrieval-metrics.json"
        );
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

    async record(metrics: RetrievalMetrics, cacheHit: boolean): Promise<void> {
        if (!this.loaded) await this.load();

        this.stats.totalRetrievals++;

        const n = this.stats.totalRetrievals;
        this.stats.averageDurationMs =
            (this.stats.averageDurationMs * (n - 1) + metrics.retrievalDurationMs) / n;

        this.stats.averageFilesRetrieved =
            (this.stats.averageFilesRetrieved * (n - 1) + metrics.retrievedFilesCount) / n;

        this.stats.averageSymbolsRetrieved =
            (this.stats.averageSymbolsRetrieved * (n - 1) + metrics.retrievedSymbolsCount) / n;

        this.stats.averageTokens =
            (this.stats.averageTokens * (n - 1) + metrics.tokenEstimate) / n;

        const hits = this.stats.cacheHitRate * (n - 1) + (cacheHit ? 1 : 0);
        this.stats.cacheHitRate = hits / n;

        this.stats.compressionRatioAverage =
            (this.stats.compressionRatioAverage * (n - 1) + metrics.compressionRatio) / n;

        await this.save();
    }

    async get(): Promise<RetrievalStatistics> {
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
