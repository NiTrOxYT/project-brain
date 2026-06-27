import { ContextBundle } from "./types.js";

export interface ExecutionContext {

    query: string;

    project: {

        framework: string;

        language: string;

        packageManager: string;

    };

    files: string[];

    symbols: string[];

    dependencies: string[];

}

export class ContextAssembler {

    assemble(
        bundle: ContextBundle
    ): ExecutionContext {

        return {

            query: bundle.query,

            project: {

                framework:
                    bundle.project.framework,

                language:
                    bundle.project.language,

                packageManager:
                    bundle.project.packageManager

            },

            files:

                bundle.files
                    .sort(
                        (a, b) =>
                            b.score - a.score
                    )
                    .map(
                        file => file.path
                    ),

            symbols:

                bundle.symbols.map(
                    symbol =>
                        `${symbol.kind}:${symbol.name}`
                ),

            dependencies:

                bundle.imports.map(
                    edge =>
                        `${edge.source} -> ${edge.target}`
                )

        };

    }

}
