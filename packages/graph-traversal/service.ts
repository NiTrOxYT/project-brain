import path from "path";

import { FileSystemService } from "../filesystem/index.js";

export class GraphTraversalService {

    private readonly filesystem =
        new FileSystemService();

    constructor(
        private readonly workspaceRoot: string
    ) {}

    async traverse(
        files: string[],
        depth = 1
    ): Promise<string[]> {

        const graph =
            await this.filesystem.readJson<any>(
                path.join(
                    this.workspaceRoot,
                    "graph",
                    "graph.json"
                )
            );

        const visited = new Set(files);

        let frontier = [...files];

        for (let i = 0; i < depth; i++) {

            const next: string[] = [];

            for (const file of frontier) {

                for (const edge of graph.edges) {

                    if (
                        edge.from === file &&
                        !visited.has(edge.to)
                    ) {

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
