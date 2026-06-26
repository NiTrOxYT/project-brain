// ──────────────────────────────────────────────────────────────────────────────
// BUILD-052 — Learning Engine — Optimizer
// ──────────────────────────────────────────────────────────────────────────────
export class LearningOptimizer {
    generateRules(experiences, providers, repairs) {
        const rules = [];
        const timestamp = new Date().toISOString();
        // 1. Rule: Provider Preference (e.g. Prefer Claude for Refactors, Ollama for Documentation)
        for (const prov of providers) {
            if (prov.totalExecutions >= 2 && prov.successRate >= 80) {
                for (const taskType of prov.preferredTaskTypes) {
                    // Match tasks of this type run by this provider
                    const evidenceList = experiences
                        .filter(e => e.providerId === prov.providerId && e.taskType === taskType && e.outcome === "success")
                        .map(e => ({ executionId: e.id, timestamp: e.timestamp }));
                    if (evidenceList.length >= 2) {
                        rules.push({
                            id: `opt-provider-pref-${prov.providerId}-${taskType}`.toLowerCase(),
                            description: `Prefer ${prov.providerId} for ${taskType} tasks based on historical success rate of ${prov.successRate.toFixed(1)}%.`,
                            ruleType: "provider-preference",
                            condition: { taskType },
                            action: { preferredProvider: prov.providerId },
                            confidence: prov.rollingConfidence,
                            evidenceCount: evidenceList.length,
                            lastUpdated: timestamp,
                            evidence: evidenceList
                        });
                    }
                }
            }
        }
        // 2. Rule: Timeout Adaptation (e.g. increase timeout for tasks with timeout errors or high durations)
        const timeouts = experiences.filter(e => e.errors && e.errors.some(err => err.toLowerCase().includes("timeout") || err.toLowerCase().includes("timed out")));
        const timeoutGroups = new Map();
        for (const e of timeouts) {
            if (!timeoutGroups.has(e.taskType)) {
                timeoutGroups.set(e.taskType, []);
            }
            timeoutGroups.get(e.taskType).push(e);
        }
        for (const [taskType, exps] of timeoutGroups.entries()) {
            const evidenceList = exps.map(e => ({ executionId: e.id, timestamp: e.timestamp }));
            rules.push({
                id: `opt-timeout-adapt-${taskType}`.toLowerCase(),
                description: `Increase timeout bounds for ${taskType} tasks due to repeated timeout failures.`,
                ruleType: "timeout-adaptation",
                condition: { taskType },
                action: { recommendedTimeout: 60_000 }, // Increase to 60s
                confidence: parseFloat((Math.min(1.0, exps.length / 3)).toFixed(2)),
                evidenceCount: exps.length,
                lastUpdated: timestamp,
                evidence: evidenceList
            });
        }
        // 3. Rule: Validator Skipping (e.g. Skip custom validators if they pass 5+ times consecutively without failure)
        const validations = experiences.filter(e => e.validationScore === 100);
        if (validations.length >= 5) {
            const evidenceList = validations.slice(-5).map(e => ({ executionId: e.id, timestamp: e.timestamp }));
            rules.push({
                id: "opt-validator-skipping-consecutive",
                description: "Skip custom validation pipelines after 5 consecutive successful validations.",
                ruleType: "validator-skipping",
                condition: { consecutiveSuccess: 5 },
                action: { skipValidator: "custom" },
                confidence: 0.9,
                evidenceCount: validations.length,
                lastUpdated: timestamp,
                evidence: evidenceList
            });
        }
        // 4. Rule: Retry Reduction (e.g. Reduce retries for Compilation/Type errors that never succeed without code modifications)
        const compileFailures = repairs.filter(r => r.errorType === "TypeError" || r.errorType === "DependencyError");
        for (const repair of compileFailures) {
            if (repair.totalCount >= 2 && repair.successCount === 0) {
                rules.push({
                    id: `opt-retry-reduction-${repair.errorType}`.toLowerCase(),
                    description: `Reduce maximum retries for deterministic ${repair.errorType} failures to avoid redundant runs.`,
                    ruleType: "retry-reduction",
                    condition: { errorType: repair.errorType },
                    action: { maxRetries: 1 },
                    confidence: repair.confidence || 0.8,
                    evidenceCount: repair.totalCount,
                    lastUpdated: timestamp,
                    evidence: [...repair.evidence]
                });
            }
        }
        // 5. Rule: Parallel Execution Preference
        const successRate = experiences.length > 0
            ? (experiences.filter(e => e.outcome === "success").length / experiences.length) * 100
            : 0;
        if (experiences.length >= 10 && successRate > 90) {
            const evidenceList = experiences.slice(-5).map(e => ({ executionId: e.id, timestamp: e.timestamp }));
            rules.push({
                id: "opt-parallel-execution-pref",
                description: "Prefer parallel execution strategies for planning tasks due to high average success rates.",
                ruleType: "parallel-execution",
                condition: { successRateMin: 90 },
                action: { parallel: true },
                confidence: 0.95,
                evidenceCount: experiences.length,
                lastUpdated: timestamp,
                evidence: evidenceList
            });
        }
        // Sort rules deterministically by ID to ensure identical history produces identical rule list
        rules.sort((a, b) => a.id.localeCompare(b.id));
        return rules;
    }
}
