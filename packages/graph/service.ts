import path from "path";

import { FileSystemService } from "../filesystem/index.js";
import { ProjectGraph } from "./types.js";

export class GraphService {

    private readonly fs = new FileSystemService();

    constructor(
        private readonly workspace: string
    ) {}

    async initialize(): Promise<void> {

        const graphPath = path.join(
            this.workspace,
            "graph",
            "graph.json"
        );

        if (await this.fs.exists(graphPath)) {
            return;
        }

        const graph: ProjectGraph = {
            nodes: [],
            edges: []
        };

        await this.fs.writeJson(
            graphPath,
            graph
        );

    }

}
