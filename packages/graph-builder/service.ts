import path from "path";

import { FileSystemService } from "../filesystem";
import { ImportIndex } from "../imports";
import { DependencyGraph } from "./types";

export class GraphBuilderService {

    private readonly filesystem = new FileSystemService();

    constructor(
        private readonly workspaceRoot: string
    ) {}

    async build(): Promise<DependencyGraph> {

        const imports = await this.filesystem.readJson<ImportIndex>(
            path.join(
                this.workspaceRoot,
                "index",
                "imports.json"
            )
        );

        const nodes = new Set<string>();

        const edges = imports.imports.map(importRecord => {

            nodes.add(importRecord.source);

            return {

                from: importRecord.source,

                to: importRecord.target,

                type: "imports" as const

            };

        });

        const graph: DependencyGraph = {

            generatedAt: new Date().toISOString(),

            nodes: [...nodes].map(node => ({

                id: node,

                type: "file" as const

            })),

            edges

        };

        await this.filesystem.writeJson(

            path.join(
                this.workspaceRoot,
                "graph",
                "dependencies.json"
            ),

            graph

        );

        return graph;

    }

}
