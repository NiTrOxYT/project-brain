// ──────────────────────────────────────────────────────────────────────────────
// BUILD-054 — Context Compiler — Optimizer
// Performs summary compression and duplicate pruning on snapshot sections.
// Does NOT modify snapshot structure — returns optimized content string per section.
// ──────────────────────────────────────────────────────────────────────────────
import { SnapshotFingerprintEngine } from "./fingerprint.js";
export class SnapshotOptimizer {
    fpEngine = new SnapshotFingerprintEngine();
    optimize(snapshot) {
        const optimizationsApplied = [];
        let tokensSaved = 0;
        const optimizedSections = snapshot.sections.map(section => {
            let content = section.content;
            const originalLength = content.length;
            // 1. Parse, deduplicate arrays in the JSON content
            try {
                const parsed = JSON.parse(content);
                if (Array.isArray(parsed)) {
                    const deduped = this.deduplicateArray(parsed);
                    if (deduped.length < parsed.length) {
                        content = JSON.stringify(deduped);
                        optimizationsApplied.push(`Deduplication: ${section.id}`);
                    }
                }
            }
            catch {
                // Non-JSON or complex structure — skip
            }
            // 2. Truncate oversized sections that are low priority (>= 70)
            if (content.length > 50_000 && section.priority >= 70) {
                content = content.slice(0, 50_000) + "...";
                optimizationsApplied.push(`Truncation: ${section.id}`);
            }
            const newTokens = Math.ceil(content.length / 4);
            const oldTokens = section.estimatedTokens;
            tokensSaved += Math.max(0, oldTokens - newTokens);
            if (content === section.content) {
                return section;
            }
            const contentHash = this.fpEngine.hashContent(content);
            return {
                ...section,
                content,
                contentHash,
                estimatedTokens: newTokens
            };
        });
        return {
            sections: optimizedSections,
            tokensSaved,
            optimizationsApplied: [...new Set(optimizationsApplied)]
        };
    }
    // ─── Internal ────────────────────────────────────────────────────────────
    deduplicateArray(arr) {
        const seen = new Set();
        return arr.filter(item => {
            const key = typeof item === "object"
                ? JSON.stringify(item)
                : String(item);
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
    }
}
