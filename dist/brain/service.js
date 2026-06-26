import { OrchestratorService } from "../orchestrator";
import { QueryAnalyzerService } from "../query-analyzer";
export class BrainService {
    workspaceRoot;
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    async execute(request) {
        const analysis = new QueryAnalyzerService().analyze(request.prompt);
        const orchestrator = new OrchestratorService(this.workspaceRoot);
        const result = await orchestrator.execute({
            query: analysis.keywords.join(" ")
        });
        return {
            prompt: request.prompt,
            executionContext: result.context
        };
    }
}
