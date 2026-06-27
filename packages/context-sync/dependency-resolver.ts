import { SemanticSnapshot, SnapshotDependency } from "../context-compiler/types.js";

export class DependencyResolver {
    /**
     * Resolve the downstream transitive dependencies of changed paths to determine impact radius.
     */
    resolve(prev: SemanticSnapshot, changedPaths: string[]): string[] {
        const dirty = new Set<string>();
        const queue: string[] = [];

        // Normalize paths first
        const normalize = (p: string) => p.replace(/\\/g, "/");

        const workspaceRoot = prev.metadata.workspaceRoot;
        const toRelative = (p: string) => {
            if (p.startsWith(workspaceRoot)) {
                return normalize(p.substring(workspaceRoot.length).replace(/^[/\\]+/, ""));
            }
            return normalize(p);
        };

        for (const p of changedPaths) {
            const rel = toRelative(p);
            dirty.add(rel);
            queue.push(rel);
        }

        // Build inverse dependency graph: dependency target -> source importers
        const importers = new Map<string, string[]>();
        for (const dep of prev.dependencies) {
            const fromRel = toRelative(dep.fromPath);
            const toRel = toRelative(dep.toPath);
            const list = importers.get(toRel) || [];
            list.push(fromRel);
            importers.set(toRel, list);
        }

        // Transitive closure BFS
        let safetyCounter = 0;
        while (queue.length > 0 && safetyCounter < 10000) {
            safetyCounter++;
            const current = queue.shift()!;
            const dependents = importers.get(current) || [];
            for (const dep of dependents) {
                if (!dirty.has(dep)) {
                    dirty.add(dep);
                    queue.push(dep);
                }
            }
        }

        // Map back to absolute paths or keep relative as appropriate
        return [...dirty].map(r => {
            // Find absolute path from prev.files if exists
            const prevMatch = prev.files.find(f => toRelative(f.path) === r);
            return prevMatch ? prevMatch.path : r;
        });
    }
}
