export class DirtyRegionTracker {
    compute(prev, resolvedDirtyFiles) {
        const dirtyFiles = [...new Set(resolvedDirtyFiles)];
        const dirtyFileSet = new Set(dirtyFiles);
        // Dirty symbols are those located in dirty files
        const dirtySymbols = prev.symbols
            .filter(s => dirtyFileSet.has(s.filePath))
            .map(s => s.name);
        // Dirty relationships are those where subject or object is a dirty file
        const dirtyRelationships = [];
        for (const rel of prev.relationships) {
            if (dirtyFileSet.has(rel.subject) || dirtyFileSet.has(rel.object)) {
                dirtyRelationships.push(`${rel.subject}|${rel.predicate}|${rel.object}`);
            }
        }
        // Dirty graph nodes are execution nodes referencing dirty files or direct matches
        const dirtyGraphNodes = prev.graph.nodes
            .filter(n => n.filePath && dirtyFileSet.has(n.filePath))
            .map(n => n.id);
        return {
            dirtyFiles,
            dirtySymbols,
            dirtyRelationships,
            dirtyGraphNodes,
            dirtyArchitecture: [],
            dirtyLearning: []
        };
    }
}
