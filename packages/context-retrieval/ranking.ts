import { SemanticSnapshot } from "../context-compiler/types.js";
import { RetrievalCandidate } from "./types.js";

export class RetrievalRanker {
    rank(
        snapshot: SemanticSnapshot,
        candidatePaths: string[],
        primaryTargets: string[],
        symbols: string[],
        learning: any[]
    ): RetrievalCandidate[] {
        const result: RetrievalCandidate[] = [];

        const primarySet = new Set(primaryTargets.map(p => p.replace(/\\/g, "/")));
        const symbolSet = new Set(symbols.map(s => s.toLowerCase()));

        for (const p of candidatePaths) {
            const normalized = p.replace(/\\/g, "/");
            let score = 0;
            const reasons: string[] = [];

            // Signal 1: Primary target matching
            const isPrimary = [...primarySet].some(target => normalized.endsWith(target));
            if (isPrimary) {
                score += 100;
                reasons.push("primary-target");
            }

            // Signal 2: File locality/relatedness to primary targets
            if (!isPrimary && primaryTargets.length > 0) {
                // simple check for shared subdirectories
                const matchingDir = primaryTargets.some(target => {
                    const dir1 = path.dirname(target);
                    const dir2 = path.dirname(normalized);
                    return dir1 !== "." && dir1 === dir2;
                });
                if (matchingDir) {
                    score += 20;
                    reasons.push("file-locality");
                }
            }

            // Signal 3: Symbol relevance
            const hasMatchingSymbol = snapshot.symbols.some(s => {
                const normSymPath = s.filePath.replace(/\\/g, "/");
                return (normSymPath === normalized || normSymPath.endsWith("/" + normalized) || normalized.endsWith("/" + normSymPath)) && symbolSet.has(s.name.toLowerCase());
            });
            if (hasMatchingSymbol) {
                score += 40;
                reasons.push("symbol-relevance");
            }

            // Signal 4: Learning engine correlation
            const matchingLearning = learning.some((l: any) =>
                Array.isArray(l.filesModified) && l.filesModified.some((fm: string) => fm.replace(/\\/g, "/").endsWith(normalized))
            );
            if (matchingLearning) {
                score += 15;
                reasons.push("learning-match");
            }

            // Fallback base score
            if (score === 0) {
                score = 5;
                reasons.push("transitive-dependency");
            }

            const file = snapshot.files.find(f => f.path === p);

            result.push({
                path: p,
                score,
                reasons,
                file
            });
        }

        // Sort descending by score, then ascending alphabetically by path for determinism
        return result.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.path.localeCompare(b.path);
        });
    }
}

import path from "path";
