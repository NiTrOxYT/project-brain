import path from "path";

import { FileSystemService } from "../filesystem";
import { IndexResult } from "../indexer";
import { SymbolIndex } from "../symbols";
import { ImportIndex } from "../imports";

import {
    RetrieveRequest,
    RetrieveResult,
    RetrievedFile
} from "./types";

export class RetrieverService {

    private readonly filesystem = new FileSystemService();

    constructor(
        private readonly workspaceRoot: string
    ) {}

    async retrieve(
        request: RetrieveRequest
    ): Promise<RetrieveResult> {

        const index =
            await this.filesystem.readJson<IndexResult>(
                path.join(
                    this.workspaceRoot,
                    "index",
                    "index.json"
                )
            );

        const symbols =
            await this.filesystem.readJson<SymbolIndex>(
                path.join(
                    this.workspaceRoot,
                    "index",
                    "symbols.json"
                )
            );

        const imports =
            await this.filesystem.readJson<ImportIndex>(
                path.join(
                    this.workspaceRoot,
                    "index",
                    "imports.json"
                )
            );

        const scores = new Map<
            string,
            RetrievedFile
        >();

        const query =
            request.query.toLowerCase();

        const touch = (
            file: string
        ): RetrievedFile => {

            if (!scores.has(file)) {

                scores.set(file, {

                    path: file,

                    score: 0,

                    reasons: []

                });

            }

            return scores.get(file)!;

        };

        for (const file of index.files) {

            const name =
                path.basename(file.path)
                    .toLowerCase();

            if (
                name.includes(query)
            ) {

                const result =
                    touch(file.path);

                result.score += 50;

                result.reasons.push(
                    "filename"
                );

            }

        }

        for (const symbol of symbols.symbols) {

            if (
                symbol.name
                    .toLowerCase()
                    .includes(query)
            ) {

                const result =
                    touch(symbol.file);

                result.score += 100;

                result.reasons.push(
                    "symbol"
                );

            }

        }

        for (const edge of imports.imports) {

            if (
                edge.target
                    .toLowerCase()
                    .includes(query)
            ) {

                const result =
                    touch(edge.source);

                result.score += 25;

                result.reasons.push(
                    "import"
                );

            }

        }

        const files =
            [...scores.values()]
                .sort(
                    (a, b) =>
                        b.score - a.score
                )
                .slice(
                    0,
                    request.limit ?? 20
                );

        return {

            files

        };

    }

}
