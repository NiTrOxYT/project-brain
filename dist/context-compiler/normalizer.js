// ──────────────────────────────────────────────────────────────────────────────
// BUILD-054 — Context Compiler — Normalizer
// Applies deterministic sorting, path normalization, deduplication, and
// relationship sorting to guarantee byte-identical output for identical inputs.
// ──────────────────────────────────────────────────────────────────────────────
import path from "path";
export class SnapshotNormalizer {
    /** Normalize a filesystem path to POSIX-style relative path. */
    normalizePath(filePath, base) {
        const rel = path.relative(base, filePath);
        return rel.split(path.sep).join("/");
    }
    /** Normalize and sort SnapshotFile array. */
    normalizeFiles(files) {
        const seen = new Set();
        const unique = files.filter(f => {
            if (seen.has(f.path))
                return false;
            seen.add(f.path);
            return true;
        });
        return unique.sort((a, b) => a.path.localeCompare(b.path));
    }
    /** Normalize and sort SnapshotSymbol array. */
    normalizeSymbols(symbols) {
        const seen = new Set();
        const unique = symbols.filter(s => {
            const key = `${s.filePath}::${s.name}::${s.kind}`;
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
        return unique.sort((a, b) => {
            const fileComp = a.filePath.localeCompare(b.filePath);
            if (fileComp !== 0)
                return fileComp;
            const lineComp = a.line - b.line;
            if (lineComp !== 0)
                return lineComp;
            return a.name.localeCompare(b.name);
        });
    }
    /** Normalize and sort SnapshotDependency array. */
    normalizeDependencies(deps) {
        const seen = new Set();
        const unique = deps.filter(d => {
            const key = `${d.fromPath}|${d.toPath}|${d.kind}`;
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
        return unique.sort((a, b) => {
            const fromComp = a.fromPath.localeCompare(b.fromPath);
            if (fromComp !== 0)
                return fromComp;
            const toComp = a.toPath.localeCompare(b.toPath);
            if (toComp !== 0)
                return toComp;
            return a.kind.localeCompare(b.kind);
        });
    }
    /** Normalize and sort SnapshotRelationship array. */
    normalizeRelationships(rels) {
        const seen = new Set();
        const unique = rels.filter(r => {
            const key = `${r.subject}|${r.predicate}|${r.object}`;
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
        return unique.sort((a, b) => {
            const subComp = a.subject.localeCompare(b.subject);
            if (subComp !== 0)
                return subComp;
            const predComp = a.predicate.localeCompare(b.predicate);
            if (predComp !== 0)
                return predComp;
            return a.object.localeCompare(b.object);
        });
    }
    /** Normalize graph nodes — sort by id. */
    normalizeNodes(nodes) {
        const seen = new Set();
        const unique = nodes.filter(n => {
            if (seen.has(n.id))
                return false;
            seen.add(n.id);
            return true;
        });
        return unique.sort((a, b) => a.id.localeCompare(b.id));
    }
    /** Normalize graph edges — sort by fromId, then toId, then kind. */
    normalizeEdges(edges) {
        const seen = new Set();
        const unique = edges.filter(e => {
            const key = `${e.fromId}|${e.toId}|${e.kind}`;
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
        return unique.sort((a, b) => {
            const fComp = a.fromId.localeCompare(b.fromId);
            if (fComp !== 0)
                return fComp;
            const tComp = a.toId.localeCompare(b.toId);
            if (tComp !== 0)
                return tComp;
            return a.kind.localeCompare(b.kind);
        });
    }
    /** Normalize architecture entries. */
    normalizeArchitecture(entries) {
        const seen = new Set();
        const unique = entries.filter(e => {
            const key = `${e.category}|${e.title}`;
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
        return unique.sort((a, b) => {
            const catComp = a.category.localeCompare(b.category);
            if (catComp !== 0)
                return catComp;
            return a.title.localeCompare(b.title);
        });
    }
    /** Normalize evolution entries. */
    normalizeEvolution(entries) {
        const seen = new Set();
        const unique = entries.filter(e => {
            if (seen.has(e.path))
                return false;
            seen.add(e.path);
            return true;
        });
        return unique.sort((a, b) => {
            // Sort by change count descending, then path ascending
            const countComp = b.changeCount - a.changeCount;
            if (countComp !== 0)
                return countComp;
            return a.path.localeCompare(b.path);
        });
    }
    /** Normalize learning entries. */
    normalizeLearning(entries) {
        const seen = new Set();
        const unique = entries.filter(e => {
            if (seen.has(e.id))
                return false;
            seen.add(e.id);
            return true;
        });
        return unique.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    }
    /**
     * Compute topological sort (Kahn's algorithm) for graph nodes.
     * Nodes with no incoming edges come first.
     * Ties broken by node ID for determinism.
     */
    topologicalSort(nodes, edges) {
        const nodeIds = nodes.map(n => n.id);
        const inDegree = new Map();
        const adjList = new Map();
        for (const id of nodeIds) {
            inDegree.set(id, 0);
            adjList.set(id, []);
        }
        for (const edge of edges) {
            if (!inDegree.has(edge.toId) || !inDegree.has(edge.fromId))
                continue;
            inDegree.set(edge.toId, (inDegree.get(edge.toId) ?? 0) + 1);
            adjList.get(edge.fromId).push(edge.toId);
        }
        // Queue: all nodes with in-degree 0, sorted by id for determinism
        const queue = nodeIds
            .filter(id => inDegree.get(id) === 0)
            .sort((a, b) => a.localeCompare(b));
        const result = [];
        while (queue.length > 0) {
            // Pop smallest id from front (already sorted)
            const current = queue.shift();
            result.push(current);
            const neighbors = (adjList.get(current) ?? []).sort((a, b) => a.localeCompare(b));
            for (const neighbor of neighbors) {
                const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
                inDegree.set(neighbor, newDegree);
                if (newDegree === 0) {
                    // Insert in sorted position to maintain determinism
                    const insertIdx = queue.findIndex(id => id.localeCompare(neighbor) > 0);
                    if (insertIdx === -1) {
                        queue.push(neighbor);
                    }
                    else {
                        queue.splice(insertIdx, 0, neighbor);
                    }
                }
            }
        }
        // Append any remaining nodes (cycles) sorted by id
        const remaining = nodeIds
            .filter(id => !result.includes(id))
            .sort((a, b) => a.localeCompare(b));
        return [...result, ...remaining];
    }
}
