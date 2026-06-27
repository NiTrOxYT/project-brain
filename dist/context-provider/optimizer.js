export class TokenBudgetOptimizer {
    static optimize(maxTokens, rawArchitectureSummary, rawRankedFiles, rawMemoryEntries, rawSnippets, rawDependencies) {
        const start = Date.now();
        let remainingTokens = maxTokens;
        // Allocate budget:
        // 1. Architecture summary (high priority)
        let architectureSummary = "";
        const archTokens = this.estimateTokens(rawArchitectureSummary);
        if (remainingTokens >= archTokens) {
            architectureSummary = rawArchitectureSummary;
            remainingTokens -= archTokens;
        }
        // 2. Semantic memory
        const semanticMemory = [];
        for (const entry of rawMemoryEntries) {
            const entryTokens = this.estimateTokens(entry.content);
            if (remainingTokens >= entryTokens) {
                semanticMemory.push(entry);
                remainingTokens -= entryTokens;
            }
            else {
                break;
            }
        }
        // 3. snippets
        const snippets = [];
        for (const snip of rawSnippets) {
            const snipTokens = this.estimateTokens(snip.code) + this.estimateTokens(snip.comment);
            if (remainingTokens >= snipTokens) {
                snippets.push(snip);
                remainingTokens -= snipTokens;
            }
            else {
                break;
            }
        }
        // 4. dependency summaries
        const dependencySummary = [];
        for (const dep of rawDependencies) {
            const depTokens = dep.imports.reduce((acc, i) => acc + this.estimateTokens(i), 0);
            if (remainingTokens >= depTokens) {
                dependencySummary.push(dep);
                remainingTokens -= depTokens;
            }
            else {
                break;
            }
        }
        // 5. Ranked files metadata
        const rankedFiles = [];
        for (const f of rawRankedFiles) {
            const fileTokens = 10; // Overhead per metadata record
            if (remainingTokens >= fileTokens) {
                rankedFiles.push(f);
                remainingTokens -= fileTokens;
            }
            else {
                break;
            }
        }
        const estimatedTokens = maxTokens - remainingTokens;
        return {
            architectureSummary,
            rankedFiles,
            semanticMemory,
            snippets,
            dependencySummary,
            estimatedTokens,
            confidence: 0.95, // mock high confidence
            retrievalTimeMs: Date.now() - start
        };
    }
    static estimateTokens(text) {
        // Safe character-to-token ratio approximation (4 chars = 1 token)
        return Math.ceil(text.length / 4);
    }
}
