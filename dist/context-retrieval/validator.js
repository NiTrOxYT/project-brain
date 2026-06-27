export class RetrievalValidator {
    validate(pkg, budgetLimit = 80000) {
        const errors = [];
        const warnings = [];
        // 1. Check duplicate candidate files
        const seenCandidates = new Set();
        for (const c of pkg.candidates) {
            const norm = c.path.replace(/\\/g, "/");
            if (seenCandidates.has(norm)) {
                errors.push(`Duplicate retrieval candidate file: '${c.path}'`);
            }
            seenCandidates.add(norm);
        }
        // 2. Check duplicate symbols
        const seenSymbols = new Set();
        for (const s of pkg.symbols) {
            const key = `${s.filePath}::${s.name}`;
            if (seenSymbols.has(key)) {
                errors.push(`Duplicate retrieval symbol: '${s.name}' in '${s.filePath}'`);
            }
            seenSymbols.add(key);
        }
        // 3. Check duplicate graph edges
        const seenEdges = new Set();
        for (const e of pkg.graph.edges) {
            const key = `${e.fromId}|${e.toId}|${e.kind}`;
            if (seenEdges.has(key)) {
                errors.push(`Duplicate graph edge detected: '${key}'`);
            }
            seenEdges.add(key);
        }
        // 4. Budget violations
        let totalTokens = 0;
        for (const s of pkg.sections) {
            totalTokens += s.estimatedTokens;
        }
        if (totalTokens > budgetLimit) {
            errors.push(`Retrieval budget overflow: total estimated tokens ${totalTokens} exceeds budget limit ${budgetLimit}`);
        }
        // 5. Check ordering (determinism check: sections sorted by priority)
        for (let i = 1; i < pkg.sections.length; i++) {
            if (pkg.sections[i].priority < pkg.sections[i - 1].priority) {
                warnings.push(`Incorrect section priority ordering: priority ${pkg.sections[i].priority} follows ${pkg.sections[i - 1].priority}`);
            }
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
}
