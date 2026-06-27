import { PromptSection, PromptOptimization } from "./types.js";
import crypto from "crypto";

export class PromptOptimizer {
    optimize(sections: PromptSection[], targetSymbol?: string): {
        optimizedSections: PromptSection[];
        optimizations: PromptOptimization[];
    } {
        const optimizations: PromptOptimization[] = [];
        let currentSections = sections.map(s => ({ ...s }));

        // Pass 1: Normalize
        let beforeLen = this.getTotalLength(currentSections);
        currentSections = this.passNormalize(currentSections);
        let afterLen = this.getTotalLength(currentSections);
        if (beforeLen > afterLen) {
            optimizations.push({
                id: "opt-normalize",
                type: "whitespace-normalization",
                description: "Normalized whitespace and line endings across sections.",
                tokensSaved: Math.ceil((beforeLen - afterLen) / 4)
            });
        }

        // Pass 2: Remove duplicate sections
        beforeLen = this.getTotalLength(currentSections);
        currentSections = this.passRemoveDuplicates(currentSections);
        afterLen = this.getTotalLength(currentSections);
        if (beforeLen > afterLen) {
            optimizations.push({
                id: "opt-dedup",
                type: "duplicate-removal",
                description: "Removed duplicate sections with identical content or keys.",
                tokensSaved: Math.ceil((beforeLen - afterLen) / 4)
            });
        }

        // Pass 3: Collapse repeated instructions
        beforeLen = this.getTotalLength(currentSections);
        currentSections = this.passCollapseInstructions(currentSections);
        afterLen = this.getTotalLength(currentSections);
        if (beforeLen > afterLen) {
            optimizations.push({
                id: "opt-collapse",
                type: "instruction-merging",
                description: "Collapsed duplicate instructional lines within rules.",
                tokensSaved: Math.ceil((beforeLen - afterLen) / 4)
            });
        }

        // Pass 4: Compress summaries
        beforeLen = this.getTotalLength(currentSections);
        currentSections = this.passCompressSummaries(currentSections);
        afterLen = this.getTotalLength(currentSections);
        if (beforeLen > afterLen) {
            optimizations.push({
                id: "opt-compress",
                type: "summary-compression",
                description: "Compressed verbose file and directory summaries.",
                tokensSaved: Math.ceil((beforeLen - afterLen) / 4)
            });
        }

        // Pass 5: Prioritize symbols
        beforeLen = this.getTotalLength(currentSections);
        currentSections = this.passPrioritizeSymbols(currentSections, targetSymbol);
        afterLen = this.getTotalLength(currentSections);
        if (beforeLen > afterLen) {
            optimizations.push({
                id: "opt-symbols",
                type: "symbol-prioritization",
                description: `Prioritized target symbol ${targetSymbol} and pruned unrelated declarations.`,
                tokensSaved: Math.ceil((beforeLen - afterLen) / 4)
            });
        }

        // Pass 6: Merge identical constraints
        beforeLen = this.getTotalLength(currentSections);
        currentSections = this.passMergeConstraints(currentSections);
        afterLen = this.getTotalLength(currentSections);
        if (beforeLen > afterLen) {
            optimizations.push({
                id: "opt-constraints",
                type: "instruction-merging", // Using defined union type or similar
                description: "Merged duplicate key-value engineering constraints.",
                tokensSaved: Math.ceil((beforeLen - afterLen) / 4)
            });
        }

        // Pass 7: Remove dead sections
        const beforeCount = currentSections.length;
        beforeLen = this.getTotalLength(currentSections);
        currentSections = this.passRemoveDeadSections(currentSections);
        afterLen = this.getTotalLength(currentSections);
        if (beforeCount > currentSections.length || beforeLen > afterLen) {
            optimizations.push({
                id: "opt-dead",
                type: "dead-code-pruning",
                description: "Pruned empty or dead context sections.",
                tokensSaved: Math.ceil((beforeLen - afterLen) / 4)
            });
        }

        return {
            optimizedSections: currentSections,
            optimizations
        };
    }

    private getTotalLength(sections: PromptSection[]): number {
        return sections.reduce((acc, s) => acc + s.content.length, 0);
    }

    // Pass 1: Normalize spacing and line endings
    private passNormalize(sections: PromptSection[]): PromptSection[] {
        return sections.map(s => {
            const content = s.content
                .replace(/\r\n/g, "\n")
                .replace(/[ \t]+/g, " ")
                .split("\n")
                .map(line => line.trim())
                .filter((line, i, arr) => line !== "" || (i > 0 && arr[i - 1] !== "")) // Max 1 empty line
                .join("\n")
                .trim();
            return { ...s, content };
        });
    }

    // Pass 2: Remove duplicate sections by content hash or ID
    private passRemoveDuplicates(sections: PromptSection[]): PromptSection[] {
        const seenIds = new Set<string>();
        const seenHashes = new Set<string>();
        const result: PromptSection[] = [];

        for (const s of sections) {
            const hash = crypto.createHash("sha256").update(s.content).digest("hex");
            if (seenIds.has(s.id) || seenHashes.has(hash)) {
                continue; // Skip duplicate
            }
            seenIds.add(s.id);
            seenHashes.add(hash);
            result.push(s);
        }
        return result;
    }

    private passCollapseInstructions(sections: PromptSection[]): PromptSection[] {
        return sections.map(s => {
            if (s.id.includes("rules") || s.id.includes("instructions") || s.id.includes("validation")) {
                const lines = s.content.split("\n");
                const seenLines = new Set<string>();
                const collapsed: string[] = [];
                for (const line of lines) {
                    const normLine = line.toLowerCase().trim().replace(/[-*0-9.\s]+/g, "");
                    if (normLine.length > 0) {
                        if (seenLines.has(normLine)) continue;
                        seenLines.add(normLine);
                    }
                    collapsed.push(line);
                }
                return { ...s, content: collapsed.join("\n") };
            }
            return s;
        });
    }

    // Pass 4: Compress verbose summaries
    private passCompressSummaries(sections: PromptSection[]): PromptSection[] {
        return sections.map(s => {
            if (s.id.includes("summary") || s.id.includes("description")) {
                if (s.content.length > 600) {
                    // Compress: take first 250 chars and last 250 chars, add marker
                    const compressed = s.content.slice(0, 250) + "\n... [Summary Compressed to save tokens] ...\n" + s.content.slice(-250);
                    return { ...s, content: compressed };
                }
            }
            return s;
        });
    }

    // Pass 5: Prioritize target symbol, prune other symbol details
    private passPrioritizeSymbols(sections: PromptSection[], targetSymbol?: string): PromptSection[] {
        if (!targetSymbol) return sections;
        return sections.map(s => {
            if (s.id.includes("symbols")) {
                const lines = s.content.split("\n");
                const symbolLines: string[] = [];
                const otherLines: string[] = [];
                let currentSymName = "";

                // Group by symbol block if structured
                for (const line of lines) {
                    if (line.includes(targetSymbol)) {
                        symbolLines.push(line);
                    } else {
                        otherLines.push(line);
                    }
                }
                // Keep target symbol lines first, and truncate other lines if there are too many
                const finalLines = [...symbolLines, ...otherLines.slice(0, 10)];
                if (otherLines.length > 10) {
                    finalLines.push("// ... Other symbols truncated to prioritize target symbol ...");
                }
                return { ...s, content: finalLines.join("\n") };
            }
            return s;
        });
    }

    // Pass 6: Merge identical constraints
    private passMergeConstraints(sections: PromptSection[]): PromptSection[] {
        return sections.map(s => {
            if (s.id.includes("constraints")) {
                // If structured key-value constraints like "- Key: Value"
                const lines = s.content.split("\n");
                const constraintMap = new Map<string, string>();
                for (const line of lines) {
                    const match = line.match(/^[-*\s]*([^:]+):\s*(.*)$/);
                    if (match) {
                        const key = match[1].trim().toLowerCase();
                        if (!constraintMap.has(key)) {
                            constraintMap.set(key, line);
                        }
                    } else {
                        if (!constraintMap.has(line)) {
                            constraintMap.set(line, line);
                        }
                    }
                }
                return { ...s, content: Array.from(constraintMap.values()).join("\n") };
            }
            return s;
        });
    }

    // Pass 7: Remove dead/empty sections
    private passRemoveDeadSections(sections: PromptSection[]): PromptSection[] {
        return sections.filter(s => s.content.length > 0);
    }
}
