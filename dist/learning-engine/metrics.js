// ──────────────────────────────────────────────────────────────────────────────
// BUILD-052 — Learning Engine — Metrics Tracker
// ──────────────────────────────────────────────────────────────────────────────
export class LearningMetricsTracker {
    compute(experiences, rules) {
        const total = experiences.length;
        const successful = experiences.filter(e => e.outcome === "success").length;
        const failed = total - successful;
        const totalRepairs = experiences.reduce((sum, e) => sum + e.repairCycles, 0);
        const averageRepairCount = total > 0 ? totalRepairs / total : 0;
        const totalRetries = experiences.reduce((sum, e) => sum + e.retries, 0);
        const averageRetries = total > 0 ? totalRetries / total : 0;
        const averageExecutionDuration = total > 0
            ? experiences.reduce((sum, e) => sum + e.durationMs, 0) / total
            : 0;
        // Provider Usage mapping
        const providerUsage = {};
        for (const e of experiences) {
            providerUsage[e.providerId] = (providerUsage[e.providerId] ?? 0) + 1;
        }
        // Token savings: estimate ~30% token reduction per optimization rule applied or successful cached run
        const tokenSavings = successful * 250;
        // Cost savings: estimate cheaper provider substitution (e.g. Claude sonnet to Ollama or Gemini)
        const costSavings = successful * 0.05;
        const learningGrowth = experiences.length * 10 + rules.length * 50;
        return {
            totalExecutions: total,
            successfulExecutions: successful,
            failedExecutions: failed,
            averageRepairCount,
            averageRetries,
            averageValidationDuration: averageRepairCount * 250, // rough simulation
            averageExecutionDuration,
            providerUsage,
            tokenSavings,
            costSavings,
            optimizationCount: rules.length,
            learningGrowth
        };
    }
}
