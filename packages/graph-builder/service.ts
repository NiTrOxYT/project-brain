import path from "path";

import { FileSystemService } from "../filesystem/index.js";
import { ImportIndex } from "../imports/index.js";
import { DependencyGraph } from "./types.js";

export class GraphBuilderService {

    private readonly filesystem = new FileSystemService();

    constructor(
        private readonly workspaceRoot: string
    ) {}

    async build(): Promise<DependencyGraph> {

        const {

            ImportResolverService
        
        } = await import(
            "../import-resolver/index.js"
        );
        
        const imports = {
        
            imports:
        
                await new ImportResolverService(
        
                    this.workspaceRoot
        
                ).resolve()
        
        };

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
                "graph.json"
            ),
            graph
        );

        return graph;

    }

}
