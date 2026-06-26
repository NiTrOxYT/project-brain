import { OrchestratorService } from "../orchestrator";
export class BrainService {
    workspaceRoot;
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    async execute(request) {
        const orchestrator = new OrchestratorService(this.workspaceRoot);
        const result = await orchestrator.execute({
            query: request.prompt
        });
        return {
            prompt: request.prompt,
            executionContext: result.context
        };
    }
}
