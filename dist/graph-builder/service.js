import path from "path";
import { FileSystemService } from "../filesystem";
export class GraphBuilderService {
    workspaceRoot;
    filesystem = new FileSystemService();
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    async build() {
        const imports = await this.filesystem.readJson(path.join(this.workspaceRoot, "index", "imports.json"));
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
        await this.filesystem.writeJson(path.join(this.workspaceRoot, "graph", "dependencies.json"), graph);
        return graph;
    }
}
