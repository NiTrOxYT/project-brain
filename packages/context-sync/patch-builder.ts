import crypto from "crypto";
import {
    SemanticSnapshot,
    SnapshotFile,
    SnapshotSymbol,
    SnapshotDependency,
    SnapshotRelationship,
    SnapshotGraph,
    SnapshotSection,
    SnapshotFingerprint
} from "../context-compiler/types.js";
import { SnapshotPatch, SectionPatch } from "./types.js";
import { SnapshotFingerprintEngine } from "../context-compiler/fingerprint.js";

export class PatchBuilder {
    private readonly fpEngine = new SnapshotFingerprintEngine();

    build(params: {
        prev: SemanticSnapshot;
        files: SnapshotFile[];
        symbols: SnapshotSymbol[];
        dependencies: SnapshotDependency[];
        relationships: SnapshotRelationship[];
        graph: SnapshotGraph;
        transactionId?: string;
    }): SnapshotPatch {
        const { prev, files, symbols, dependencies, relationships, graph, transactionId } = params;

        const sectionPatches: SectionPatch[] = [];

        // 1. Filesystem Index Section Rebuild
        const fsContent = JSON.stringify(files.map(f => ({
            path: f.path,
            relativePath: f.relativePath,
            extension: f.extension,
            sizeBytes: f.sizeBytes,
            language: f.language,
            linesOfCode: f.linesOfCode
        })));
        const fsHash = this.fpEngine.hashContent(fsContent);
        sectionPatches.push({
            sectionId: "filesystem-index",
            op: "update",
            content: fsContent,
            priority: 10,
            contentHash: fsHash,
            estimatedTokens: Math.ceil(fsContent.length / 4)
        });

        // 2. Symbol Index Section Rebuild
        const symContent = JSON.stringify(symbols.map(s => ({
            name: s.name,
            kind: s.kind,
            filePath: s.filePath,
            line: s.line,
            exported: s.exported
        })));
        const symHash = this.fpEngine.hashContent(symContent);
        sectionPatches.push({
            sectionId: "symbol-index",
            op: "update",
            content: symContent,
            priority: 20,
            contentHash: symHash,
            estimatedTokens: Math.ceil(symContent.length / 4)
        });

        // 3. Dependency Graph Section Rebuild
        const depContent = JSON.stringify(dependencies.slice(0, 500));
        const depHash = this.fpEngine.hashContent(depContent);
        sectionPatches.push({
            sectionId: "dependency-graph",
            op: "update",
            content: depContent,
            priority: 50,
            contentHash: depHash,
            estimatedTokens: Math.ceil(depContent.length / 4)
        });

        // 4. Knowledge Graph (Relationships) Rebuild
        const relContent = JSON.stringify(relationships.slice(0, 500));
        const relHash = this.fpEngine.hashContent(relContent);
        sectionPatches.push({
            sectionId: "knowledge-graph",
            op: "update",
            content: relContent,
            priority: 40,
            contentHash: relHash,
            estimatedTokens: Math.ceil(relContent.length / 4)
        });

        // 5. Execution Graph Rebuild
        const graphContent = JSON.stringify({
            nodes: graph.nodes.slice(0, 200),
            edges: graph.edges.slice(0, 200),
            topologicalOrder: graph.topologicalOrder.slice(0, 200)
        });
        const graphHash = this.fpEngine.hashContent(graphContent);
        sectionPatches.push({
            sectionId: "execution-graph",
            op: "update",
            content: graphContent,
            priority: 60,
            contentHash: graphHash,
            estimatedTokens: Math.ceil(graphContent.length / 4)
        });

        // Other sections can remain unchanged and not patched, or simply keep existing content
        const activeSectionIds = new Set(sectionPatches.map(s => s.sectionId));
        for (const sec of prev.sections) {
            if (!activeSectionIds.has(sec.id)) {
                sectionPatches.push({
                    sectionId: sec.id,
                    op: "update",
                    content: sec.content,
                    priority: sec.priority,
                    contentHash: sec.contentHash,
                    estimatedTokens: sec.estimatedTokens
                });
            }
        }

        // Recompute hashes
        const filesystemHash = fsHash;
        const symbolHash = symHash;
        const relationshipHash = relHash;
        const graphHashVal = graphHash;

        const combined = [
            filesystemHash,
            prev.metadata.fingerprint.architectureHash || "",
            prev.metadata.fingerprint.evolutionHash || ""
        ].join("|");

        const finalHash = crypto.createHash("sha256").update(combined).digest("hex");
        const version = this.deriveVersion(finalHash);

        const fingerprint: SnapshotFingerprint = {
            hash: finalHash,
            filesystemHash,
            graphHash: graphHashVal,
            architectureHash: prev.metadata.fingerprint.architectureHash,
            evolutionHash: prev.metadata.fingerprint.evolutionHash,
            learningHash: prev.metadata.fingerprint.learningHash,
            version
        };

        const totalTokens = sectionPatches.reduce((acc, s) => acc + (s.estimatedTokens || 0), 0);

        return {
            patchId: `patch-${crypto.randomBytes(6).toString("hex")}`,
            fromSnapshotId: prev.snapshotId,
            toSnapshotId: finalHash,
            createdAt: new Date().toISOString(),
            transactionId,
            sectionPatches,
            graphPatch: {
                nodesAdded: graph.nodes.filter(n => !prev.graph.nodes.some(pn => pn.id === n.id)),
                nodesUpdated: graph.nodes.filter(n => prev.graph.nodes.some(pn => pn.id === n.id)),
                nodesDeleted: prev.graph.nodes.filter(pn => !graph.nodes.some(n => n.id === pn.id)).map(n => n.id),
                edgesAdded: graph.edges.filter(e => !prev.graph.edges.some(pe => pe.fromId === e.fromId && pe.toId === e.toId)),
                edgesDeleted: prev.graph.edges.filter(pe => !graph.edges.some(e => e.fromId === pe.fromId && e.toId === pe.toId)),
                topologicalOrder: graph.topologicalOrder
            },
            dependencyPatch: {
                added: dependencies.filter(d => !prev.dependencies.some(pd => pd.fromPath === d.fromPath && pd.toPath === d.toPath)),
                deleted: prev.dependencies.filter(pd => !dependencies.some(d => d.fromPath === pd.fromPath && d.toPath === pd.toPath))
            },
            symbolPatch: {
                added: symbols.filter(s => !prev.symbols.some(ps => ps.name === s.name && ps.filePath === s.filePath)),
                modified: symbols.filter(s => prev.symbols.some(ps => ps.name === s.name && ps.filePath === s.filePath && ps.contentHash !== s.contentHash)),
                deleted: prev.symbols.filter(ps => !symbols.some(s => s.name === ps.name && s.filePath === ps.filePath))
            },
            metadataUpdate: {
                fileCount: files.length,
                symbolCount: symbols.length,
                dependencyEdgeCount: dependencies.length,
                graphNodeCount: graph.nodes.length,
                estimatedTokens: totalTokens,
                fingerprint
            }
        };
    }

    private deriveVersion(hash: string): string {
        const seg1 = parseInt(hash.slice(0, 4), 16) % 1000;
        const seg2 = parseInt(hash.slice(4, 8), 16) % 1000;
        const seg3 = parseInt(hash.slice(8, 12), 16) % 1000;
        return `${seg1}.${seg2}.${seg3}`;
    }
}
