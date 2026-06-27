// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Prompt Diff Engine
// Computes structured diffs between original and optimized prompts.
// Tracks removed/added context blocks with reasons and token accounting.
// ──────────────────────────────────────────────────────────────────────────────
const DEFAULT_COST_CONFIG = { usdPer1kTokens: 0.003 };
// ─── Engine ───────────────────────────────────────────────────────────────────
export class PromptDiffEngine {
    costConfig;
    constructor(costConfig = {}) {
        this.costConfig = { ...DEFAULT_COST_CONFIG, ...costConfig };
    }
    /**
     * Compute a PromptDiff from original and optimized prompts plus
     * the list of operations that the optimizer performed.
     *
     * Token counts use the standard approximation: 1 token ≈ 4 characters.
     * No external tokenizer dependency is introduced.
     */
    compute(originalPrompt, optimizedPrompt, operations) {
        const removed = operations
            .filter(op => op.action === "remove")
            .map(op => this.toChunk(op));
        const added = operations
            .filter(op => op.action === "add")
            .map(op => this.toChunk(op));
        const tokensBefore = this.estimateTokens(originalPrompt);
        const tokensAfter = this.estimateTokens(optimizedPrompt);
        const savedTokens = Math.max(0, tokensBefore - tokensAfter);
        const savedPct = tokensBefore > 0
            ? Math.round((savedTokens / tokensBefore) * 100)
            : 0;
        const estimatedSavedUsd = (savedTokens / 1000) * this.costConfig.usdPer1kTokens;
        return {
            originalPrompt,
            optimizedPrompt,
            removed,
            added,
            tokensBefore,
            tokensAfter,
            savedTokens,
            savedPct,
            estimatedSavedUsd,
        };
    }
    /**
     * Estimate token count from raw text.
     * Rule of thumb: 1 token ≈ 4 characters (conservative).
     */
    estimateTokens(text) {
        return Math.ceil(text.length / 4);
    }
    // ── Private ───────────────────────────────────────────────────────────────
    toChunk(op) {
        return {
            kind: op.kind,
            label: op.label,
            tokenCount: this.estimateTokens(op.content),
            reason: op.reason,
        };
    }
}
