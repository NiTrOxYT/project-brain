export class RetrievalCompressor {
    compress(pkg) {
        // 1. Deduplicate Candidates
        const seenCandidates = new Set();
        const candidates = pkg.candidates.filter(c => {
            const normalized = c.path.replace(/\\/g, "/");
            if (seenCandidates.has(normalized))
                return false;
            seenCandidates.add(normalized);
            return true;
        });
        // 2. Merge Duplicate Symbols
        const seenSymbols = new Set();
        const symbols = pkg.symbols.filter(s => {
            const key = `${s.filePath}::${s.name}`;
            if (seenSymbols.has(key))
                return false;
            seenSymbols.add(key);
            return true;
        });
        // 3. Collapse Graph Edges and Nodes
        const seenNodes = new Set();
        const nodes = pkg.graph.nodes.filter(n => {
            if (seenNodes.has(n.id))
                return false;
            seenNodes.add(n.id);
            return true;
        });
        const seenEdges = new Set();
        const edges = pkg.graph.edges.filter(e => {
            const key = `${e.fromId}|${e.toId}|${e.kind}`;
            if (seenEdges.has(key))
                return false;
            seenEdges.add(key);
            return true;
        });
        // 4. Deduplicate Dependencies
        const seenDeps = new Set();
        const dependencies = pkg.dependencies.filter(d => {
            const key = `${d.fromPath}|${d.toPath}|${d.kind}`;
            if (seenDeps.has(key))
                return false;
            seenDeps.add(key);
            return true;
        });
        // Preserve deterministic sorting for everything
        return {
            ...pkg,
            candidates: candidates.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)),
            symbols: symbols.sort((a, b) => a.filePath.localeCompare(b.filePath) || a.name.localeCompare(b.name)),
            dependencies: dependencies.sort((a, b) => a.fromPath.localeCompare(b.fromPath) || a.toPath.localeCompare(b.toPath)),
            graph: {
                nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
                edges: edges.sort((a, b) => a.fromId.localeCompare(b.fromId) || a.toId.localeCompare(b.toId)),
                topologicalOrder: pkg.graph.topologicalOrder.filter(id => seenNodes.has(id))
            }
        };
    }
}
