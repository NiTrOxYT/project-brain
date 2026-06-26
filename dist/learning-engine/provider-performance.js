// ──────────────────────────────────────────────────────────────────────────────
// BUILD-052 — Learning Engine — Provider Performance Tracker
// ──────────────────────────────────────────────────────────────────────────────
export class ProviderPerformanceTracker {
    update(experiences) {
        const providerMap = new Map();
        for (const exp of experiences) {
            if (!providerMap.has(exp.providerId)) {
                providerMap.set(exp.providerId, []);
            }
            providerMap.get(exp.providerId).push(exp);
        }
        const results = [];
        for (const [providerId, exps] of providerMap.entries()) {
            const total = exps.length;
            if (total === 0)
                continue;
            const successful = exps.filter(e => e.outcome === "success");
            const failed = exps.filter(e => e.outcome === "failure" || e.outcome === "aborted");
            const successRate = (successful.length / total) * 100;
            const failureRate = (failed.length / total) * 100;
            const repairCycles = exps.filter(e => e.repairCycles > 0);
            const repairSuccessCount = repairCycles.filter(e => e.outcome === "success").length;
            const repairSuccessRate = repairCycles.length > 0
                ? (repairSuccessCount / repairCycles.length) * 100
                : 100;
            const averageDurationMs = exps.reduce((sum, e) => sum + e.durationMs, 0) / total;
            const averageTokens = exps.reduce((sum, e) => sum + e.tokensUsed, 0) / total;
            const averageCost = exps.reduce((sum, e) => sum + e.cost, 0) / total;
            const averageValidationScore = exps.reduce((sum, e) => sum + e.validationScore, 0) / total;
            // Preferred languages from file extensions in successful runs
            const languages = new Map();
            for (const e of successful) {
                for (const file of e.filesModified || []) {
                    const ext = file.split(".").pop();
                    if (ext) {
                        const lang = this.extToLanguage(ext);
                        languages.set(lang, (languages.get(lang) ?? 0) + 1);
                    }
                }
            }
            const preferredLanguages = Array.from(languages.entries())
                .sort((a, b) => b[1] - a[1])
                .map(a => a[0])
                .slice(0, 3);
            // Preferred task types in successful runs
            const taskTypes = new Map();
            for (const e of successful) {
                if (e.taskType) {
                    taskTypes.set(e.taskType, (taskTypes.get(e.taskType) ?? 0) + 1);
                }
            }
            const preferredTaskTypes = Array.from(taskTypes.entries())
                .sort((a, b) => b[1] - a[1])
                .map(a => a[0])
                .slice(0, 3);
            // Preferred repository size (e.g. small < 10 files modified, medium < 50, large otherwise)
            // Statically estimated for simplified deterministic classification
            const avgFiles = exps.reduce((sum, e) => sum + (e.filesModified?.length || 0), 0) / total;
            const preferredRepositorySize = avgFiles < 5 ? "Small" : (avgFiles < 20 ? "Medium" : "Large");
            // Rolling confidence based on successRate and task count volume
            const volumeWeight = Math.min(1.0, total / 5);
            const rollingConfidence = parseFloat(((successRate / 100) * volumeWeight).toFixed(2));
            results.push({
                providerId,
                successRate,
                failureRate,
                repairSuccessRate,
                averageDurationMs: Math.round(averageDurationMs),
                averageTokens: Math.round(averageTokens),
                averageCost,
                averageValidationScore,
                preferredLanguages,
                preferredTaskTypes,
                preferredRepositorySize,
                rollingConfidence,
                totalExecutions: total
            });
        }
        return results;
    }
    extToLanguage(ext) {
        switch (ext.toLowerCase()) {
            case "ts": return "TypeScript";
            case "js": return "JavaScript";
            case "md": return "Markdown";
            case "json": return "JSON";
            case "py": return "Python";
            case "go": return "Go";
            default: return ext.toUpperCase();
        }
    }
}
