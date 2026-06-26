// ──────────────────────────────────────────────────────────────────────────────
// BUILD-052 — Learning Engine — Recommender
// ──────────────────────────────────────────────────────────────────────────────
export class LearningRecommender {
    recommend(request, rules, providers, prompts, repairs) {
        const rulesApplied = [];
        let recommendedProvider = "claude-code"; // Default fallback
        let providerConfidence = 0.5;
        // 1. Find provider preference from optimization rules
        const prefRule = rules.find(r => r.ruleType === "provider-preference" &&
            r.condition?.taskType === request.taskType);
        if (prefRule) {
            recommendedProvider = prefRule.action.preferredProvider;
            providerConfidence = prefRule.confidence;
            rulesApplied.push(prefRule.id);
        }
        else {
            // Find provider with highest rolling confidence for this task type
            const candidates = providers.filter(p => p.preferredTaskTypes.includes(request.taskType) || p.successRate > 70);
            if (candidates.length > 0) {
                candidates.sort((a, b) => b.rollingConfidence - a.rollingConfidence);
                recommendedProvider = candidates[0].providerId;
                providerConfidence = candidates[0].rollingConfidence;
            }
        }
        // 2. Find recommended prompt
        let recommendedPrompt;
        let promptConfidence = 0.0;
        const matchingPrompts = prompts.filter(p => p.taskType === request.taskType && p.providerId === recommendedProvider);
        if (matchingPrompts.length > 0) {
            matchingPrompts.sort((a, b) => b.successRate - a.successRate);
            recommendedPrompt = matchingPrompts[0].promptBody;
            promptConfidence = matchingPrompts[0].successRate / 100;
        }
        // 3. Find timeout adaptation
        let recommendedTimeout;
        const timeoutRule = rules.find(r => r.ruleType === "timeout-adaptation" &&
            r.condition?.taskType === request.taskType);
        if (timeoutRule) {
            recommendedTimeout = timeoutRule.action.recommendedTimeout;
            rulesApplied.push(timeoutRule.id);
        }
        // 4. Find retry adaptation
        let recommendedRetryCount;
        const retryRule = rules.find(r => r.ruleType === "retry-reduction" &&
            (r.condition?.taskType === request.taskType || r.condition?.errorType === "TypeError"));
        if (retryRule) {
            recommendedRetryCount = retryRule.action.maxRetries;
            rulesApplied.push(retryRule.id);
        }
        // 5. Validator Pipeline
        let recommendedValidatorPipeline;
        const valRule = rules.find(r => r.ruleType === "validator-skipping");
        if (valRule) {
            recommendedValidatorPipeline = ["compile"]; // Skip custom, only do compile
            rulesApplied.push(valRule.id);
        }
        else {
            recommendedValidatorPipeline = ["compile", "test", "custom"];
        }
        // 6. Recommended execution order (highest confidence first)
        const sortedProviders = [...providers].sort((a, b) => b.rollingConfidence - a.rollingConfidence);
        const recommendedExecutionOrder = sortedProviders.map(p => p.providerId);
        if (!recommendedExecutionOrder.includes(recommendedProvider)) {
            recommendedExecutionOrder.unshift(recommendedProvider);
        }
        // 7. Repair strategy
        let recommendedRepairStrategy = "refactor";
        const matchingRepairs = repairs.filter(r => r.providerId === recommendedProvider && r.successCount > 0);
        if (matchingRepairs.length > 0) {
            matchingRepairs.sort((a, b) => b.confidence - a.confidence);
            recommendedRepairStrategy = matchingRepairs[0].recommendedFix.includes("install")
                ? "retry_same"
                : "refactor";
        }
        return {
            recommendedProvider,
            recommendedModel: undefined,
            recommendedPrompt,
            recommendedTimeout,
            recommendedRetryCount,
            recommendedValidatorPipeline,
            recommendedRepairStrategy,
            recommendedExecutionOrder,
            providerConfidence,
            promptConfidence,
            rulesApplied
        };
    }
}
