import { OrchestratorService } from "../orchestrator";
import { QueryAnalyzerService } from "../query-analyzer";

import {
    BrainRequest,
    BrainResponse
} from "./types";

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
