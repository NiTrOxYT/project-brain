// ──────────────────────────────────────────────────────────────────────────────
// BUILD-070C — CLI — search_memory command
// brain search_memory <query> [--debug]  →  Search memory and show diagnostics
// ──────────────────────────────────────────────────────────────────────────────

import { GlobalOptions } from "../main.js";
import { logger } from "../utils/logger.js";
import { printJson } from "../utils/json.js";
import { requireBrainInitialized } from "../utils/paths.js";
import { ValidationError } from "../utils/errors.js";
import { SnapshotStorage } from "../../context-compiler/storage.js";

export interface SearchMemoryOptions {
    query?: string;
    debug?: boolean;
}

export async function runSearchMemory(opts: GlobalOptions, cmdOpts: SearchMemoryOptions): Promise<void> {
    requireBrainInitialized(opts.workspace);

    if (!cmdOpts.query) {
        throw new ValidationError("Search query is required. Usage: brain search_memory <query> [--debug]");
    }

    const storage = new SnapshotStorage(opts.workspace);
    const snapshot = await storage.latest();

    if (!snapshot) {
        if (opts.json) {
            printJson({ ok: false, error: "No snapshot available. Run: brain compile" });
        } else {
            logger.error("No snapshot available. Run: brain compile");
        }
        return;
    }

    const queryTerms = cmdOpts.query.toLowerCase().split(/\s+/).filter(Boolean);
    const semanticEntries = snapshot.semanticMemory || [];
    const architectureEntries = snapshot.architecture || [];
    const learningEntries = snapshot.learning || [];
    const totalEntriesCount = semanticEntries.length + architectureEntries.length + learningEntries.length;

    const matches: any[] = [];
    const filteredOut: any[] = [];

    // Lexical match engine with token normalization & substring support
    // 1. Semantic Memory
    for (const entry of semanticEntries) {
        let matchCount = 0;
        const entryTerms = entry.terms || [];
        const fileLower = (entry.file || "").toLowerCase();

        for (const term of queryTerms) {
            const hasTermMatch = entryTerms.some((t: string) => {
                const tLower = t.toLowerCase();
                return tLower.startsWith(term) || (tLower.length >= 3 && term.startsWith(tLower));

            });
            const hasFileMatch = fileLower.includes(term);
            if (hasTermMatch || hasFileMatch) {
                matchCount++;
            }
        }


        const score = queryTerms.length > 0 ? matchCount / queryTerms.length : 0;
        const confidence = Math.min(0.99, 0.5 + score * 0.5);

        if (matchCount > 0) {
            matches.push({
                id: entry.id || `${entry.file}::semantic`,
                type: "semantic",
                content: `File: ${entry.file} contains symbol matching terms: ${entryTerms.join(", ")}`,
                score,
                confidence
            });
        } else {
            filteredOut.push({
                id: entry.id || `${entry.file}::semantic`,
                reason: "No matching query terms"
            });
        }
    }

    // 2. Architecture Memory
    for (let i = 0; i < architectureEntries.length; i++) {
        const entry = architectureEntries[i];
        let matchCount = 0;
        const text = `${entry.category} ${entry.title} ${entry.description}`.toLowerCase();

        for (const term of queryTerms) {
            if (text.includes(term)) {
                matchCount++;
            }
        }

        const score = queryTerms.length > 0 ? matchCount / queryTerms.length : 0;
        const confidence = Math.min(0.99, 0.5 + score * 0.5);
        const id = `ARCH-${String(i).padStart(4, "0")}`;

        if (matchCount > 0) {
            matches.push({
                id,
                type: "architecture",
                content: `[${entry.category}] ${entry.title}: ${entry.description}`,
                score,
                confidence
            });
        } else {
            filteredOut.push({ id, reason: "No matching query terms" });
        }
    }

    // 3. Learning Memory
    for (let i = 0; i < learningEntries.length; i++) {
        const entry = learningEntries[i];
        let matchCount = 0;
        const text = `${entry.taskType} ${entry.outcome}`.toLowerCase();

        for (const term of queryTerms) {
            if (text.includes(term)) {
                matchCount++;
            }
        }

        const score = queryTerms.length > 0 ? matchCount / queryTerms.length : 0;
        const confidence = Math.min(0.99, 0.5 + score * 0.5);
        const id = entry.id || `LEARN-${String(i).padStart(4, "0")}`;

        if (matchCount > 0) {
            matches.push({
                id,
                type: "learning",
                content: `Task: ${entry.taskType}, Outcome: ${entry.outcome}, Score: ${entry.validationScore}`,
                score,
                confidence
            });
        } else {
            filteredOut.push({ id, reason: "No matching query terms" });
        }
    }

    // Sort by confidence descending
    matches.sort((a, b) => b.confidence - a.confidence);
    const returned = matches.slice(0, 10);

    if (cmdOpts.debug) {
        logger.log(`Loaded snapshot:      ${snapshot.snapshotId}`);
        logger.log(`Memory entries:       ${totalEntriesCount}`);
        logger.log(`Candidate matches:    ${matches.length}`);
        
        logger.log("Similarity scores:");
        for (const m of matches.slice(0, 15)) {
            logger.log(`  - ${m.id}: score=${m.score.toFixed(4)} confidence=${m.confidence.toFixed(4)} type=${m.type}`);
        }
        if (matches.length > 15) {
            logger.log(`  ... and ${matches.length - 15} more matches.`);
        }

        logger.log("Filtered entries:");
        for (const f of filteredOut.slice(0, 10)) {
            logger.log(`  - ${f.id}: ${f.reason}`);
        }
        if (filteredOut.length > 10) {
            logger.log(`  ... and ${filteredOut.length - 10} more filtered entries.`);
        }

        logger.log("Returned entries:");
        for (const r of returned) {
            logger.log(`  - ${r.id} (${r.type}) [conf=${r.confidence.toFixed(2)}]: ${r.content}`);
        }
    } else {
        if (opts.json) {
            printJson({
                ok: true,
                query: cmdOpts.query,
                memories: returned.map(r => ({ id: r.id, type: r.type, content: r.content, confidence: r.confidence }))
            });
        } else {
            logger.log(`Query: ${cmdOpts.query}`);
            logger.log(`Matches: ${returned.length}`);
            logger.blank();
            for (const r of returned) {
                logger.log(`[${r.type}] (Confidence: ${r.confidence.toFixed(2)}) ${r.content}`);
            }
        }
    }
}
