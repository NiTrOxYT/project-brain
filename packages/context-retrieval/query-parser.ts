export interface ParsedQuery {
    intent: "Feature" | "Bug" | "Refactor" | "Documentation" | "Test" | "Validation" | "Architecture" | "Dependency" | "Cleanup" | "Repair";
    targetFiles: string[];
    targetSymbols: string[];
    targetModules: string[];
    keywords: string[];
    constraints: string[];
}

export class QueryParser {
    parse(query: string): ParsedQuery {
        const lower = query.toLowerCase();

        // 1. Detect Intent
        let intent: ParsedQuery["intent"] = "Feature"; // default
        if (lower.includes("repair") || lower.includes("reconstruct")) {
            intent = "Repair";
        } else if (lower.includes("validate") || lower.includes("verify") || lower.includes("check")) {
            intent = "Validation";
        } else if (lower.includes("refactor") || lower.includes("rewrite")) {
            intent = "Refactor";
        } else if (lower.includes("cleanup") || lower.includes("prune") || lower.includes("remove")) {
            intent = "Cleanup";
        } else if (lower.includes("test") || lower.includes("spec") || lower.includes("suite")) {
            intent = "Test";
        } else if (lower.includes("fix") || lower.includes("bug") || lower.includes("error") || lower.includes("fail") || lower.includes("issue")) {
            intent = "Bug";
        } else if (lower.includes("doc") || lower.includes("readme") || lower.includes("comment")) {
            intent = "Documentation";
        } else if (lower.includes("architecture") || lower.includes("design") || lower.includes("memory")) {
            intent = "Architecture";
        } else if (lower.includes("dependency") || lower.includes("import") || lower.includes("export")) {
            intent = "Dependency";
        }

        // 2. Extract target files (paths ending in file extensions or containing slashes)
        const targetFiles: string[] = [];
        const fileRegex = /([a-zA-Z0-9_\-\/]+\.(ts|tsx|js|jsx|json|md|py|go|rs|java|cpp|h))/g;
        let match;
        while ((match = fileRegex.exec(query)) !== null) {
            targetFiles.push(match[1]);
        }

        // 3. Extract target symbols (camelCase, PascalCase, or words in quotes/backticks)
        const targetSymbols: string[] = [];
        const quoteRegex = /[`"']([a-zA-Z0-9_]+)[`"']/g;
        while ((match = quoteRegex.exec(query)) !== null) {
            targetSymbols.push(match[1]);
        }

        // Add PascalCase or camelCase words from the query that look like class or function names
        const symbolRegex = /\b([A-Z][a-zA-Z0-9_]{3,}|[a-z]+[A-Z][a-zA-Z0-9_]*)\b/g;
        while ((match = symbolRegex.exec(query)) !== null) {
            const sym = match[1];
            // Skip common keywords
            if (
                sym !== "TypeScript" &&
                sym !== "JavaScript" &&
                sym !== "JSON" &&
                sym !== "HTML" &&
                sym !== "Query" &&
                !targetSymbols.includes(sym)
            ) {
                targetSymbols.push(sym);
            }
        }

        // 4. Keywords
        const keywords = query
            .split(/[^a-zA-Z0-9_\-]+/)
            .map(w => w.trim().toLowerCase())
            .filter(w => w.length > 3 && !["this", "that", "with", "from", "into", "your"].includes(w));

        return {
            intent,
            targetFiles: [...new Set(targetFiles)],
            targetSymbols: [...new Set(targetSymbols)],
            targetModules: [],
            keywords: [...new Set(keywords)],
            constraints: []
        };
    }
}
