export class RetrievalDiagnosticsBuilder {
    build(params) {
        const timeline = params.metrics.stages.map(s => ({
            stage: s.name,
            ms: s.durationMs
        }));
        const rankingExplanation = params.candidates.map(c => ({
            path: c.path,
            score: c.score,
            reasons: c.reasons
        }));
        const ratio = params.originalTokens > 0
            ? (params.originalTokens - params.finalTokens) / params.originalTokens
            : 0;
        return {
            retrievalId: params.retrievalId,
            timeline,
            rankingExplanation,
            budgetAllocation: params.budget,
            expansionTree: [], // kept empty for simplicity
            compressionSummary: {
                originalTokens: params.originalTokens,
                finalTokens: params.finalTokens,
                ratio
            }
        };
    }
    format(diag) {
        const lines = [];
        lines.push(`=== Context Retrieval Diagnostics ===`);
        lines.push(`Retrieval ID      : ${diag.retrievalId}`);
        lines.push(`Original Tokens   : ${diag.compressionSummary.originalTokens}`);
        lines.push(`Final Tokens      : ${diag.compressionSummary.finalTokens}`);
        lines.push(`Reduction Ratio   : ${(diag.compressionSummary.ratio * 100).toFixed(1)}%`);
        lines.push(``);
        lines.push(`--- Timeline ---`);
        for (const stage of diag.timeline) {
            lines.push(`  ${stage.stage.padEnd(24)} : ${stage.ms}ms`);
        }
        lines.push(``);
        lines.push(`--- Top Ranked Candidates ---`);
        for (const c of diag.rankingExplanation.slice(0, 10)) {
            lines.push(`  ${c.score.toString().padEnd(4)} | ${c.path} [${c.reasons.join(", ")}]`);
        }
        lines.push(``);
        lines.push(`--- Budget Allocation ---`);
        lines.push(`  Max Tokens       : ${diag.budgetAllocation.maxTokens}`);
        lines.push(`  Actual Allocation:`);
        for (const [k, v] of Object.entries(diag.budgetAllocation.actual)) {
            lines.push(`    - ${k.padEnd(14)} : ${v} tokens`);
        }
        return lines.join("\n");
    }
}
