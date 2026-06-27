import { GraphTraversalService } from "../graph-traversal/index.js";
import path from "path";

import { FileSystemService } from "../filesystem/index.js";
import { RetrieverService } from "../retriever/index.js";

import {
    ContextBundle,
    ContextRequest
} from "./types.js";

export class ContextLoaderService {

    private readonly filesystem =
        new FileSystemService();

    private readonly retriever;

    constructor(
        private readonly workspaceRoot: string
    ) {

        this.retriever =
            new RetrieverService(
                workspaceRoot
            );

    }

    async load(
        request: ContextRequest
    ): Promise<ContextBundle> {

        const retrieval =
            await this.retriever.retrieve({

                query: request.query,

                limit: 10

            });

	const expandedFiles =
    await new GraphTraversalService(
        this.workspaceRoot
    ).traverse(
        retrieval.files.map(file => file.path),
        1
    );

        const project =
            await this.filesystem.readJson<any>(
                path.join(
                    this.workspaceRoot,
                    "knowledge",
                    "project.json"
                )
            );

        const symbols =
            await this.filesystem.readJson<any>(
                path.join(
                    this.workspaceRoot,
                    "index",
                    "symbols.json"
                )
            );

        const imports =
            await this.filesystem.readJson<any>(
                path.join(
                    this.workspaceRoot,
                    "index",
                    "imports.json"
                )
            );

        return {

            query: request.query,

            project,

files:
    retrieval.files.filter(
        file =>
            expandedFiles.includes(
                file.path
            )
    ),

            symbols: symbols.symbols.filter(
                (symbol: any) =>
                    retrieval.files.some(
                        file =>
                            file.path === symbol.file
                    )
            ),

            imports: imports.imports.filter(
                (edge: any) =>
                    retrieval.files.some(
                        file =>
                            file.path === edge.source
                    )
            )

        };

    }

}
