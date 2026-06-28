import type { RankedFile, MemoryEntry, ContextSnippet, DependencySummary, ContextResponse } from "./types.js";

export class TokenBudgetOptimizer {
    static optimize(
        maxTokens: number,
        rawArchitectureSummary: string,
        rawRankedFiles: RankedFile[],
        rawMemoryEntries: MemoryEntry[],
        rawSnippets: ContextSnippet[],
        rawDependencies: DependencySummary[]
    ): ContextResponse {
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
        const semanticMemory: MemoryEntry[] = [];
        for (const entry of rawMemoryEntries) {
            const entryTokens = this.estimateTokens(entry.content);
            if (remainingTokens >= entryTokens) {
                semanticMemory.push(entry);
                remainingTokens -= entryTokens;
            } else {
                continue;
            }
        }

        // 3. snippets
        const snippets: ContextSnippet[] = [];
        for (const snip of rawSnippets) {
            const snipTokens = this.estimateTokens(snip.code) + this.estimateTokens(snip.comment);
            if (remainingTokens >= snipTokens) {
                snippets.push(snip);
                remainingTokens -= snipTokens;
            } else {
                continue;
            }
        }

        // 4. dependency summaries
        const dependencySummary: DependencySummary[] = [];
        for (const dep of rawDependencies) {
            const depTokens = dep.imports.reduce((acc, i) => acc + this.estimateTokens(i), 0);
            if (remainingTokens >= depTokens) {
                dependencySummary.push(dep);
                remainingTokens -= depTokens;
            } else {
                continue;
            }
        }


        // 5. Ranked files metadata
        const rankedFiles: RankedFile[] = [];
        for (const f of rawRankedFiles) {
            const fileTokens = 10; // Overhead per metadata record
            if (remainingTokens >= fileTokens) {
                rankedFiles.push(f);
                remainingTokens -= fileTokens;
            } else {
                continue;
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

    private static estimateTokens(text: string): number {
        // Safe character-to-token ratio approximation (4 chars = 1 token)
        return Math.ceil(text.length / 4);
    }
}
