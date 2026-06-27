import { OrchestratorService } from "../orchestrator/index.js";
import { QueryAnalyzerService } from "../query-analyzer/index.js";

import {
    BrainRequest,
    BrainResponse
} from "./types.js";

export class BrainService {

    constructor(
        private readonly workspaceRoot: string
    ) {}

    async execute(
        request: BrainRequest
    ): Promise<BrainResponse> {

        const analysis =
            new QueryAnalyzerService().analyze(
                request.prompt
            );

        const orchestrator =
            new OrchestratorService(
                this.workspaceRoot
            );

        const result =
            await orchestrator.execute({

                query: analysis.keywords.join(" ")

            });

        return {

            prompt: request.prompt,

            executionContext:
                result.context

        };

    }

}
