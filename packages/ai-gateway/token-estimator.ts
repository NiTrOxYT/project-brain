// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — AI Gateway — Pluggable Token Estimator
// Pluggable estimators replacing hardcoded char/token ratios inside the gateway.
// ──────────────────────────────────────────────────────────────────────────────

import { Plugin, PluginKind, ServiceRegistry } from "../kernel/index.js";

export interface TokenUsage {
    inputTokens:  number;
    outputTokens: number;
}

export interface CostEstimate {
    costUsd:  number;
    savedUsd: number;
}

export interface TokenEstimator {
    readonly id:         string; // Satisfies ServiceRegistry constraint (equals providerId)
    readonly providerId: string;
    estimateInput(prompt: string): TokenUsage;
    estimateOutput(output: string): TokenUsage;
    estimateCost(usage: TokenUsage): CostEstimate;
}

// ─── Service Registry ─────────────────────────────────────────────────────────

export class EstimatorRegistry {
    private static readonly registry = new ServiceRegistry<TokenEstimator>();

    static register(estimator: TokenEstimator): void {
        this.registry.register(estimator);
    }

    static lookup(providerId: string): TokenEstimator {
        if (this.registry.has(providerId)) {
            return this.registry.lookup(providerId);
        }
        // Graceful fallback to GenericEstimator if not found
        return new GenericEstimator(providerId);
    }

    static list(): TokenEstimator[] {
        return this.registry.list();
    }

    static clear(): void {
        this.registry.clear();
    }
}

// ─── Estimators Implementations ───────────────────────────────────────────────

export abstract class BaseEstimator implements TokenEstimator, Plugin {
    abstract readonly providerId: string;
    abstract readonly charPerToken: number;
    abstract readonly inputCostPer1K: number;
    abstract readonly outputCostPer1K: number;

    readonly kind: PluginKind = "token-estimator";
    readonly apiVersion = "1.0.0";
    readonly pluginVersion = "1.0.0";
    readonly minimumKernelVersion = "0.1.0";

    get id(): string {
        return this.providerId;
    }

    async initialize(): Promise<void> {
        EstimatorRegistry.register(this);
    }

    async shutdown(): Promise<void> {
        // no-op
    }

    estimateInput(prompt: string): TokenUsage {
        const tokens = Math.ceil(prompt.length / this.charPerToken);
        return { inputTokens: tokens, outputTokens: 0 };
    }

    estimateOutput(output: string): TokenUsage {
        const tokens = Math.ceil(output.length / this.charPerToken);
        return { inputTokens: 0, outputTokens: tokens };
    }

    estimateCost(usage: TokenUsage): CostEstimate {
        const cost = (usage.inputTokens / 1000) * this.inputCostPer1K +
                     (usage.outputTokens / 1000) * this.outputCostPer1K;
        // Saved assumes 50% savings heuristic for optimization in generic paths
        return { costUsd: cost, savedUsd: cost * 0.5 };
    }
}

export class ClaudeEstimator extends BaseEstimator {
    readonly providerId = "claude";
    readonly charPerToken = 3.5;
    readonly inputCostPer1K = 0.003;  // Claude 3.5 Sonnet: $3.00/M
    readonly outputCostPer1K = 0.015; // Output: $15.00/M
}

export class CodexEstimator extends BaseEstimator {
    readonly providerId = "codex";
    readonly charPerToken = 4.0;
    readonly inputCostPer1K = 0.0015; // Codex standard proxy: $1.50/M
    readonly outputCostPer1K = 0.002;  // Output: $2.00/M
}

export class GeminiEstimator extends BaseEstimator {
    readonly providerId = "gemini";
    readonly charPerToken = 3.8;
    readonly inputCostPer1K = 0.000075; // Gemini Flash: $0.075/M
    readonly outputCostPer1K = 0.0003;   // Output: $0.30/M
}

export class OllamaEstimator extends BaseEstimator {
    readonly providerId = "ollama";
    readonly charPerToken = 4.0;
    readonly inputCostPer1K = 0.0; // Local Ollama has zero token cost
    readonly outputCostPer1K = 0.0;
}

export class GenericEstimator extends BaseEstimator {
    readonly providerId: string;
    readonly charPerToken = 4.0;
    readonly inputCostPer1K = 0.003;
    readonly outputCostPer1K = 0.015;

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
