import path from "path";
import { FileSystemService } from "../filesystem/index.js";
export class GraphBuilderService {
    workspaceRoot;
    filesystem = new FileSystemService();
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    async build() {
        const { ImportResolverService } = await import("../import-resolver/index.js");
        const imports = {
            imports: await new ImportResolverService(this.workspaceRoot).resolve()
        };
        const nodes = new Set();
        const edges = imports.imports.map(importRecord => {
            nodes.add(importRecord.source);
            return {
                from: importRecord.source,
                to: importRecord.target,
                type: "imports"
            };
        });
        const graph = {
            generatedAt: new Date().toISOString(),
            nodes: [...nodes].map(node => ({
                id: node,
                type: "file"
            })),
            edges
        };
        await this.filesystem.writeJson(path.join(this.workspaceRoot, "graph", "graph.json"), graph);
        return graph;
    }
}
