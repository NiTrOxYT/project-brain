import { OrchestratorService } from "../orchestrator";

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

        const orchestrator =
            new OrchestratorService(
                this.workspaceRoot
            );

        const result =
            await orchestrator.execute({

                query: request.prompt

            });

        return {

            prompt: request.prompt,

            executionContext:
                result.context

        };

    }

}
