// ──────────────────────────────────────────────────────────────────────────────
// BUILD-054 — Context Compiler — Graph Compiler
// Merges execution graph + architecture entries + dependency graph into a
// unified SnapshotGraph with topological ordering.
// ──────────────────────────────────────────────────────────────────────────────

import {
    SnapshotGraph,
    SnapshotGraphNode,
    SnapshotGraphEdge,
    SnapshotDependency,
    SnapshotContext
} from "./types";
import { SnapshotNormalizer } from "./normalizer";

export class GraphCompiler {
    private readonly normalizer = new SnapshotNormalizer();

    compile(
        context: SnapshotContext,
        dependencies: SnapshotDependency[]
    ): SnapshotGraph {
        const nodes: SnapshotGraphNode[] = [];
        const edges: SnapshotGraphEdge[] = [];

        // 1. Nodes from execution graph (graph.json)
        const rawGraph = context.graphData;
        if (rawGraph) {
            const rawNodes: any[] = Array.isArray(rawGraph)
                ? rawGraph
                : Array.isArray(rawGraph.nodes)
                    ? rawGraph.nodes
                    : [];

            for (const n of rawNodes) {
                if (!n || typeof n !== "object") continue;
                const id = String(n.id || n.nodeId || "");
                if (!id) continue;
                nodes.push({
                    id,
                    type: n.type || "task",
                    title: n.title || n.label || id,
                    filePath: n.file || n.filePath || undefined,
                    status: n.status || "pending",
                    priority: typeof n.priority === "number" ? n.priority : 50,
                    metadata: n.metadata || undefined
                });
            }

            const rawEdges: any[] = Array.isArray(rawGraph.edges)
                ? rawGraph.edges
                : [];

            for (const e of rawEdges) {
                if (!e || typeof e !== "object") continue;
                const fromId = String(e.from || e.fromId || e.source || "");
                const toId = String(e.to || e.toId || e.target || "");
                if (!fromId || !toId) continue;
                edges.push({
                    fromId,
                    toId,
                    kind: this.resolveEdgeKind(e.kind || e.type),
                    weight: typeof e.weight === "number" ? e.weight : 1
                });
            }
        }

        // 2. Nodes from architecture entries (file-level nodes)
        const archEntries: any[] = context.architectureData?.entries || [];
        for (const entry of archEntries) {
            if (!entry || typeof entry !== "object") continue;
            const id = `arch::${(entry.category || "").replace(/\s+/g, "-")}::${(entry.title || "").replace(/\s+/g, "-")}`;
            if (nodes.some(n => n.id === id)) continue;
            nodes.push({
                id,
                type: "architecture",
                title: entry.title || "",
                status: "active",
                priority: 10,
                metadata: {
                    category: entry.category,
                    description: entry.description,
                    tags: entry.tags
                }
            });
        }

        // 3. Edges from dependency graph (file → file)
        for (const dep of dependencies) {
            if (!dep.fromPath || !dep.toPath) continue;

            // Ensure source and target nodes exist
            for (const p of [dep.fromPath, dep.toPath]) {
                if (!nodes.some(n => n.id === `file::${p}`)) {
                    nodes.push({
                        id: `file::${p}`,
                        type: "file",
                        title: p,
                        filePath: p,
                        status: "active",
                        priority: 80
                    });
                }
            }

            edges.push({
                fromId: `file::${dep.fromPath}`,
                toId: `file::${dep.toPath}`,
                kind: this.mapDepKindToEdgeKind(dep.kind),
                weight: 1
            });
        }

        // 4. Normalize
        const normalizedNodes = this.normalizer.normalizeNodes(nodes);
        const normalizedEdges = this.normalizer.normalizeEdges(edges);
        const topologicalOrder = this.normalizer.topologicalSort(
            normalizedNodes,
            normalizedEdges
        );

        return {
            nodes: normalizedNodes,
            edges: normalizedEdges,
            topologicalOrder
        };
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private resolveEdgeKind(raw: string): SnapshotGraphEdge["kind"] {
        const lower = (raw || "").toLowerCase();
        if (lower.includes("depend")) return "depends-on";
        if (lower.includes("trigger")) return "triggers";
        if (lower.includes("call")) return "calls";
        if (lower.includes("inherit")) return "inherits";
        return "uses";
    }

    private mapDepKindToEdgeKind(
        kind: SnapshotDependency["kind"]
    ): SnapshotGraphEdge["kind"] {
        switch (kind) {
            case "import": return "depends-on";
            case "re-export": return "depends-on";
            case "export": return "uses";
            case "dynamic": return "calls";
        }
    }
}
