import path from "path";

import { FileSystemService } from "../filesystem";
import { IndexResult } from "../indexer";
import { ImportIndex } from "../imports";

import {

    ResolvedImport

} from "./types";

export class ImportResolverService {

    private readonly filesystem =
        new FileSystemService();

    constructor(
        private readonly workspaceRoot: string
    ) {}

    async resolve(): Promise<ResolvedImport[]> {

        const index =
            await this.filesystem.readJson<IndexResult>(
                path.join(
                    this.workspaceRoot,
                    "index",
                    "index.json"
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

        const files =
            new Set(
                index.files.map(
                    file => file.path
                )
            );

        const resolved: ResolvedImport[] = [];

        for (const record of imports.imports) {

            if (
                !record.target.startsWith(".")
            ) {

                resolved.push({

                    source:
                        record.source,

                    target:
                        record.target,

                    resolved: false

                });

                continue;

            }

            const directory =
                path.dirname(
                    record.source
                );

            const base =
                path.normalize(
                    path.join(
                        directory,
                        record.target
                    )
                );

            const candidates = [

                base + ".ts",

                base + ".tsx",

                path.join(
                    base,
                    "index.ts"
                )

            ];

            const match =
                candidates.find(
                    candidate =>
                        files.has(candidate)
                );

            resolved.push({

                source:
                    record.source,

                target:
                    match ??
                    record.target,

                resolved:
                    !!match

            });

        }

        return resolved;

    }

}
