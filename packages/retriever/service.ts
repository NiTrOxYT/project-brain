import path from "path";

import { FileSystemService } from "../filesystem";
import { ScannerService } from "../scanner";
import { normalize } from "../semantic";
import { RetrieverScorer } from "./scorer";

import {

    RetrieveRequest,

    RetrieveResult

} from "./types";

export class RetrieverService {

    private readonly filesystem =
        new FileSystemService();

    constructor(
        private readonly workspaceRoot: string
    ) {}

    async retrieve(
        request: RetrieveRequest
    ): Promise<RetrieveResult> {

        const snapshot =
            await new ScannerService(
                this.workspaceRoot
            ).snapshot();

        const semantic =
            await this.filesystem.readJson<any>(
                path.join(
                    this.workspaceRoot,
                    "index",
                    "semantic.json"
                )
            );

        const queryTerms =
            normalize(
                request.query
            );

        const scorer =
            new RetrieverScorer();

        for (const entry of semantic.entries) {

            let score = 0;

            for (const term of queryTerms) {

                if (
                    entry.terms.includes(term)
                ) {

                    score += 100;

                }

            }

            if (score > 0) {

                scorer.add(

                    entry.file,

                    score,

                    "semantic"

                );

            }

        }

        for (const file of snapshot.files) {

            const name =
                path.basename(
                    file.path
                );

            for (const term of queryTerms) {

                if (
                    name
                        .toLowerCase()
                        .includes(term)
                ) {

                    scorer.add(

                        file.path,

                        25,

                        "filename"

                    );

                }

            }

        }

        return {

            files:

                scorer
                    .results()
                    .slice(
                        0,
                        request.limit ?? 20
                    )
                    .map(

                        result => ({

                            path:

                                result.file,

                            score:

                                result.score,

                            reasons:

                                result.reasons

                        })

                    )

        };

    }

}