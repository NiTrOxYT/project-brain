import path from "path";
import { FileSystemService } from "../filesystem";
export class GraphService {
    workspace;
    fs = new FileSystemService();
    constructor(workspace) {
        this.workspace = workspace;
    }
    async initialize() {
        const graphPath = path.join(this.workspace, "graph", "graph.json");
        if (await this.fs.exists(graphPath)) {
            return;
        }
        const graph = {
            nodes: [],
            edges: []
        };
        await this.fs.writeJson(graphPath, graph);
    }
}
