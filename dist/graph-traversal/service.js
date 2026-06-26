import path from "path";
import { FileSystemService } from "../filesystem";
export class GraphTraversalService {
    workspaceRoot;
    filesystem = new FileSystemService();
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    async traverse(files, depth = 1) {
        const graph = await this.filesystem.readJson(path.join(this.workspaceRoot, "graph", "dependencies.json"));
        const visited = new Set(files);
        let frontier = [...files];
        for (let i = 0; i < depth; i++) {
            const next = [];
            for (const file of frontier) {
                for (const edge of graph.edges) {
                    if (edge.from === file &&
                        !visited.has(edge.to)) {
                        visited.add(edge.to);
                        next.push(edge.to);
                    }
                }
            }
            frontier = next;
        }
        return [...visited];
    }
}
