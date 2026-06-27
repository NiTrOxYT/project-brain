// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — AI Gateway — Pluggable Token Estimator
// Pluggable estimators replacing hardcoded char/token ratios inside the gateway.
// ──────────────────────────────────────────────────────────────────────────────
import { ServiceRegistry } from "../kernel/index.js";
// ─── Service Registry ─────────────────────────────────────────────────────────
export class EstimatorRegistry {
    static registry = new ServiceRegistry();
    static register(estimator) {
        this.registry.register(estimator);
    }
    static lookup(providerId) {
        if (this.registry.has(providerId)) {
            return this.registry.lookup(providerId);
        }
        // Graceful fallback to GenericEstimator if not found
        return new GenericEstimator(providerId);
    }
    static list() {
        return this.registry.list();
    }
    static clear() {
        this.registry.clear();
    }
}
// ─── Estimators Implementations ───────────────────────────────────────────────
export class BaseEstimator {
    kind = "token-estimator";
    apiVersion = "1.0.0";
    pluginVersion = "1.0.0";
    minimumKernelVersion = "0.1.0";
    get id() {
        return this.providerId;
    }
    async initialize() {
        EstimatorRegistry.register(this);
    }
    async shutdown() {
        // no-op
    }
    estimateInput(prompt) {
        const tokens = Math.ceil(prompt.length / this.charPerToken);
        return { inputTokens: tokens, outputTokens: 0 };
    }
    estimateOutput(output) {
        const tokens = Math.ceil(output.length / this.charPerToken);
        return { inputTokens: 0, outputTokens: tokens };
    }
    estimateCost(usage) {
        const cost = (usage.inputTokens / 1000) * this.inputCostPer1K +
            (usage.outputTokens / 1000) * this.outputCostPer1K;
        // Saved assumes 50% savings heuristic for optimization in generic paths
        return { costUsd: cost, savedUsd: cost * 0.5 };
    }
}
export class ClaudeEstimator extends BaseEstimator {
    providerId = "claude";
    charPerToken = 3.5;
    inputCostPer1K = 0.003; // Claude 3.5 Sonnet: $3.00/M
    outputCostPer1K = 0.015; // Output: $15.00/M
}
export class CodexEstimator extends BaseEstimator {
    providerId = "codex";
    charPerToken = 4.0;
    inputCostPer1K = 0.0015; // Codex standard proxy: $1.50/M
    outputCostPer1K = 0.002; // Output: $2.00/M
}
export class GeminiEstimator extends BaseEstimator {
    providerId = "gemini";
    charPerToken = 3.8;
    inputCostPer1K = 0.000075; // Gemini Flash: $0.075/M
    outputCostPer1K = 0.0003; // Output: $0.30/M
}
export class OllamaEstimator extends BaseEstimator {
    providerId = "ollama";
    charPerToken = 4.0;
    inputCostPer1K = 0.0; // Local Ollama has zero token cost
    outputCostPer1K = 0.0;
}
export class GenericEstimator extends BaseEstimator {
    providerId;
    charPerToken = 4.0;
    inputCostPer1K = 0.003;
    outputCostPer1K = 0.015;
    constructor(providerId = "generic") {
        super();
        this.providerId = providerId;
    }
}
// ─── Automatic Self-Registrations ─────────────────────────────────────────────
EstimatorRegistry.register(new ClaudeEstimator());
EstimatorRegistry.register(new CodexEstimator());
EstimatorRegistry.register(new GeminiEstimator());
EstimatorRegistry.register(new OllamaEstimator());
