import { ContextLoaderService } from "../context-loader";
import { ContextAssembler } from "../context-loader";

import {
    ExecuteRequest,
    ExecuteResult
} from "./types";

export class OrchestratorService {

    constructor(
        private readonly workspaceRoot: string
    ) {}

    async execute(
        request: ExecuteRequest
    ): Promise<ExecuteResult> {

        const loader =
            new ContextLoaderService(
                this.workspaceRoot
            );

        const bundle =
            await loader.load({

                query: request.query

            });

        const context =
            new ContextAssembler()
                .assemble(bundle);

        return {

            context

        };

    }

}
