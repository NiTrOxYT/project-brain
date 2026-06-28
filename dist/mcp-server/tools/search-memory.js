import { ContextProvider } from "../../context-provider/provider.js";
import { mixedResult, errorResult } from "../tool-result.js";
import fs from "fs";
export class SearchMemoryTool {
    name = "brain.search_memory";
    description = "Query local semantic memory and recommendations for the current workspace.";
    inputSchema = {
        type: "object",
        properties: {
            query: { type: "string", description: "Semantic query to search local workspace memories and recommendations" },
            workspaceRoot: { type: "string", description: "Absolute path to the workspace root (optional)" },
        },
        required: ["query"],
    };
    async execute(args) {
        try {
            if (!args.query) {
                throw new Error("Missing query argument");
            }
            const workspaceRoot = args.workspaceRoot || process.cwd();
            let normalizedWorkspace = workspaceRoot;
            try {
                normalizedWorkspace = fs.realpathSync(workspaceRoot);
            }
            catch { }
            const provider = new ContextProvider(normalizedWorkspace, normalizedWorkspace);
            const snapshot = await provider.getLatestSnapshot();
            if (!snapshot) {
                return mixedResult("No snapshot compiled. Run: brain compile", { query: args.query, memories: [] });
            }
            const queryTerms = args.query.toLowerCase().split(/\s+/).filter(Boolean);
            const memories = [];
            // 1. Search Semantic Memory
            if (snapshot.semanticMemory) {
                for (const entry of snapshot.semanticMemory) {
                    let matchCount = 0;
                    const entryTerms = entry.terms || [];
                    const fileLower = (entry.file || "").toLowerCase();
                    for (const term of queryTerms) {
                        const hasTermMatch = entryTerms.some((t) => {
                            const tLower = t.toLowerCase();
                            return tLower.startsWith(term) || (tLower.length >= 3 && term.startsWith(tLower));
                        });
                        const hasFileMatch = fileLower.includes(term);
                        if (hasTermMatch || hasFileMatch) {
                            matchCount++;
                        }
                    }
                    if (matchCount > 0) {
                        memories.push({
                            id: entry.id || `${entry.file}::semantic`,
                            type: "semantic",
                            content: `File: ${entry.file} contains symbol matching terms: ${entryTerms.join(", ")}`,
                            confidence: Math.min(0.99, 0.5 + (matchCount / queryTerms.length) * 0.5)
                        });
                    }
                }
            }
            // 2. Search Architecture Entries
            if (snapshot.architecture) {
                for (let i = 0; i < snapshot.architecture.length; i++) {
                    const entry = snapshot.architecture[i];
                    let matchCount = 0;
                    const text = `${entry.category} ${entry.title} ${entry.description}`.toLowerCase();
                    for (const term of queryTerms) {
                        if (text.includes(term)) {
                            matchCount++;
                        }
                    }
                    if (matchCount > 0) {
                        memories.push({
                            id: `ARCH-${String(i).padStart(4, "0")}`,
                            type: "architecture",
                            content: `[${entry.category}] ${entry.title}: ${entry.description}`,
                            confidence: Math.min(0.99, 0.5 + (matchCount / queryTerms.length) * 0.5)
                        });
                    }
                }
            }
            // 3. Search Learning Entries
            if (snapshot.learning) {
                for (let i = 0; i < snapshot.learning.length; i++) {
                    const entry = snapshot.learning[i];
                    let matchCount = 0;
                    const text = `${entry.taskType} ${entry.outcome}`.toLowerCase();
                    for (const term of queryTerms) {
                        if (text.includes(term)) {
                            matchCount++;
                        }
                    }
                    if (matchCount > 0) {
                        memories.push({
                            id: entry.id || `LEARN-${String(i).padStart(4, "0")}`,
                            type: "learning",
                            content: `Task: ${entry.taskType}, Outcome: ${entry.outcome}, Score: ${entry.validationScore}`,
                            confidence: Math.min(0.99, 0.5 + (matchCount / queryTerms.length) * 0.5)
                        });
                    }
                }
            }
            // Sort by confidence descending
            memories.sort((a, b) => b.confidence - a.confidence);
            const matched = memories.slice(0, 10);
            const summary = `Found ${matched.length} memories matching query: "${args.query}"`;
            return mixedResult(summary, {
                query: args.query,
                memories: matched
            });
        }
        catch (err) {
            return errorResult(err.message || "Error running brain.search_memory");
        }
    }
}
