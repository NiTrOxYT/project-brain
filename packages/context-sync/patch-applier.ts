import { SemanticSnapshot, SnapshotSection } from "../context-compiler/types.js";
import { SnapshotPatch } from "./types.js";
import { SnapshotPatchError } from "./errors.js";

export class PatchApplier {
    apply(prev: SemanticSnapshot, patch: SnapshotPatch): SemanticSnapshot {
        try {
            // Apply section patches
            const sectionsMap = new Map<string, SnapshotSection>();
            for (const s of prev.sections) {
                sectionsMap.set(s.id, { ...s });
            }

            for (const sp of patch.sectionPatches) {
                if (sp.op === "delete") {
                    sectionsMap.delete(sp.sectionId);
                } else {
                    const existing = sectionsMap.get(sp.sectionId);
                    if (sp.op === "add" || !existing) {
                        sectionsMap.set(sp.sectionId, {
                            id: sp.sectionId,
                            name: sp.sectionId.split("-").map(w => w[0].toUpperCase() + w.substring(1)).join(" "),
                            kind: sp.sectionId as any,
                            content: sp.content || "",
                            priority: sp.priority ?? 50,
                            contentHash: sp.contentHash || "",
                            estimatedTokens: sp.estimatedTokens ?? 0,
                            sourcePaths: []
                        });
                    } else {
                        // update
                        existing.content = sp.content ?? existing.content;
                        existing.contentHash = sp.contentHash ?? existing.contentHash;
                        existing.estimatedTokens = sp.estimatedTokens ?? existing.estimatedTokens;
                        existing.priority = sp.priority ?? existing.priority;
                    }
                }
            }

            const updatedSections = [...sectionsMap.values()].sort((a, b) => {
                if (a.priority !== b.priority) return a.priority - b.priority;
                return a.id.localeCompare(b.id);
            });

            // Update graphs, symbols, dependencies, files
            const filesMap = new Map(prev.files.map(f => [f.path, f]));
            // Apply symbol deleted, added, modified
            const symbolsMap = new Map(prev.symbols.map(s => [`${s.filePath}::${s.name}`, s]));
            for (const d of patch.symbolPatch.deleted) {
                symbolsMap.delete(`${d.filePath}::${d.name}`);
            }
            for (const a of patch.symbolPatch.added) {
                symbolsMap.set(`${a.filePath}::${a.name}`, a);
            }
            for (const m of patch.symbolPatch.modified) {
                symbolsMap.set(`${m.filePath}::${m.name}`, m);
            }

            // Dependencies
            const depsMap = new Map(prev.dependencies.map(d => [`${d.fromPath}|${d.toPath}|${d.kind}`, d]));
            for (const d of patch.dependencyPatch.deleted) {
                depsMap.delete(`${d.fromPath}|${d.toPath}|${d.kind}`);
            }
            for (const a of patch.dependencyPatch.added) {
                depsMap.set(`${a.fromPath}|${a.toPath}|${a.kind}`, a);
            }

            // Graph nodes
            const nodesMap = new Map(prev.graph.nodes.map(n => [n.id, n]));
            for (const d of patch.graphPatch.nodesDeleted) {
                nodesMap.delete(d);
            }
            for (const a of patch.graphPatch.nodesAdded) {
                nodesMap.set(a.id, a);
            }
            for (const u of patch.graphPatch.nodesUpdated) {
                nodesMap.set(u.id, u);
            }

            // Graph edges
            const edgesMap = new Map(prev.graph.edges.map(e => [`${e.fromId}|${e.toId}|${e.kind}`, e]));
            for (const d of patch.graphPatch.edgesDeleted) {
                edgesMap.delete(`${d.fromId}|${d.toId}|${d.kind}`);
            }
            for (const a of patch.graphPatch.edgesAdded) {
                edgesMap.set(`${a.fromId}|${a.toId}|${a.kind}`, a);
            }

            const files = [...filesMap.values()].sort((a, b) => a.path.localeCompare(b.path));
            const symbols = [...symbolsMap.values()].sort((a, b) => {
                const fComp = a.filePath.localeCompare(b.filePath);
                if (fComp !== 0) return fComp;
                return a.name.localeCompare(b.name);
            });
            const dependencies = [...depsMap.values()].sort((a, b) => {
                const fComp = a.fromPath.localeCompare(b.fromPath);
                if (fComp !== 0) return fComp;
                return a.toPath.localeCompare(b.toPath);
            });
            const nodes = [...nodesMap.values()].sort((a, b) => a.id.localeCompare(b.id));
            const edges = [...edgesMap.values()].sort((a, b) => {
                const fComp = a.fromId.localeCompare(b.fromId);
                if (fComp !== 0) return fComp;
                return a.toId.localeCompare(b.toId);
            });

            return {
                snapshotId: patch.toSnapshotId,
                metadata: {
                    ...prev.metadata,
                    snapshotId: patch.toSnapshotId,
                    createdAt: prev.metadata.createdAt,
                    compiledAt: new Date().toISOString(),
                    fingerprint: patch.metadataUpdate.fingerprint,
                    fileCount: patch.metadataUpdate.fileCount,
                    symbolCount: patch.metadataUpdate.symbolCount,
                    dependencyEdgeCount: patch.metadataUpdate.dependencyEdgeCount,
                    graphNodeCount: patch.metadataUpdate.graphNodeCount,
                    estimatedTokens: patch.metadataUpdate.estimatedTokens,
                    incremental: true,
                    parentSnapshotId: patch.fromSnapshotId
                },
                sections: updatedSections,
                files,
                symbols,
                dependencies,
                relationships: prev.relationships, // kept for simplicity
                graph: {
                    nodes,
                    edges,
                    topologicalOrder: patch.graphPatch.topologicalOrder
                },
                architecture: prev.architecture,
                evolution: prev.evolution,
                learning: prev.learning
            };
        } catch (err: any) {
            throw new SnapshotPatchError(`Failed to apply patch: ${err.message}`);
        }
    }
}
