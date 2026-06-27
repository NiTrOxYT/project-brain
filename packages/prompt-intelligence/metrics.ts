import fs from "fs/promises";
import path from "path";
import { PromptStatistics } from "./types.js";

export class PromptMetricsCollector {
    private readonly metricsPath: string;

    constructor(private readonly workspaceRoot: string) {
        this.metricsPath = path.join(workspaceRoot, ".brain", "prompts", "metrics.json");
    }

    private async ensureDirectory(): Promise<void> {
        await fs.mkdir(path.dirname(this.metricsPath), { recursive: true });
    }

    async getStats(): Promise<PromptStatistics> {
        await this.ensureDirectory();
        try {
            const raw = await fs.readFile(this.metricsPath, "utf8");
            return JSON.parse(raw) as PromptStatistics;
        } catch {
            return {
                averagePromptSize: 0,
                compressionRatio: 1.0,
                tokenSavings: 0,
                assemblyTime: 0,
                optimizationCount: 0,
                providerUtilization: {},
                templateUsage: {},
                promptSuccessRate: 100
            };
        }
    }

    async record(params: {
        assemblyTimeMs: number;
        optimizationTimeMs: number;
        originalSize: number;
        optimizedSize: number;
        tokensSaved: number;
        providerId: string;
        templateId: string;
        success: boolean;
    }): Promise<void> {
        const stats = await this.getStats();

        const currentCount = Object.values(stats.providerUtilization).reduce((a, b) => a + b, 0);
        const nextCount = currentCount + 1;

        stats.averagePromptSize = Math.round(((stats.averagePromptSize * currentCount) + params.optimizedSize) / nextCount);
        stats.assemblyTime = Math.round(((stats.assemblyTime * currentCount) + params.assemblyTimeMs) / nextCount);
        stats.tokenSavings += params.tokensSaved;
        stats.optimizationCount += params.tokensSaved > 0 ? 1 : 0;

        const ratio = params.originalSize > 0 ? params.optimizedSize / params.originalSize : 1.0;
        stats.compressionRatio = Number(((stats.compressionRatio * currentCount + ratio) / nextCount).toFixed(4));

        stats.providerUtilization[params.providerId] = (stats.providerUtilization[params.providerId] || 0) + 1;
        stats.templateUsage[params.templateId] = (stats.templateUsage[params.templateId] || 0) + 1;

        const successfulRuns = Math.round((stats.promptSuccessRate / 100) * currentCount) + (params.success ? 1 : 0);
        stats.promptSuccessRate = Number(((successfulRuns / nextCount) * 100).toFixed(2));

        await fs.writeFile(this.metricsPath, JSON.stringify(stats, null, 2), "utf8");
    }
}
