import { SemanticSnapshot } from "../context-compiler/types";

export class DependencyExpander {
    expand(snapshot: SemanticSnapshot, filePaths: string[], maxDepth: number = 2): string[] {
        const expanded = new Set<string>();
        const queue: { path: string; depth: number }[] = [];

        // Normalize helper
        const norm = (p: string) => p.replace(/\\/g, "/");

        const filesMap = new Map(snapshot.files.map(f => [norm(f.path), f]));

        for (const p of filePaths) {
            const normalized = norm(p);
            // Locate absolute path match
            const match = [...filesMap.keys()].find(k => k.endsWith(normalized) || normalized.endsWith(k));
            if (match) {
                queue.push({ path: match, depth: 0 });
                expanded.add(match);
            }
        }

        // Build adjacency graphs
        const outgoing = new Map<string, string[]>();
        const incoming = new Map<string, string[]>();

        for (const dep of snapshot.dependencies) {
            const from = norm(dep.fromPath);
            const to = norm(dep.toPath);

            // Find full absolute paths in snapshot
            const fullFrom = [...filesMap.keys()].find(k => k.endsWith(from)) || from;
            const fullTo = [...filesMap.keys()].find(k => k.endsWith(to)) || to;

            const outList = outgoing.get(fullFrom) || [];
            outList.push(fullTo);
            outgoing.set(fullFrom, outList);

            const inList = incoming.get(fullTo) || [];
            inList.push(fullFrom);
            incoming.set(fullTo, inList);
        }

        let safety = 0;
        while (queue.length > 0 && safety++ < 10000) {
            const current = queue.shift();
            if (!current) continue;

            if (current.depth >= maxDepth) continue;

            // Expand imports/outgoing
            const outDeps = outgoing.get(current.path) || [];
            for (const o of outDeps) {
                if (!expanded.has(o)) {
                    expanded.add(o);
                    queue.push({ path: o, depth: current.depth + 1 });
                }
            }

            // Expand callers/incoming
            const inDeps = incoming.get(current.path) || [];
            for (const i of inDeps) {
                if (!expanded.has(i)) {
                    expanded.add(i);
                    queue.push({ path: i, depth: current.depth + 1 });
                }
            }
        }

        return [...expanded].sort();
    }
}
