import { ContextLoaderService } from "../context-loader";
import { ContextAssembler } from "../context-loader";
export class OrchestratorService {
    workspaceRoot;
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    async execute(request) {
        const loader = new ContextLoaderService(this.workspaceRoot);
        const bundle = await loader.load({
            query: request.query
        });
        const context = new ContextAssembler()
            .assemble(bundle);
        return {
            context
        };
    }
}
