import { OrchestratorRequest, OrchestratorResponse } from "./types.js";
import { OrchestratorScheduler } from "./scheduler.js";
import { OrchestratorExecutor } from "./executor.js";
import { OrchestratorError } from "./errors.js";
import { AgentRuntimeService } from "../agent-runtime/index.js";

export class MultiAgentOrchestratorService {
    private readonly runtimeService: AgentRuntimeService;

    constructor(

        private readonly workspaceRoot: string,

        private readonly runtime?: AgentRuntimeService

    ) {
        this.runtimeService = new AgentRuntimeService(workspaceRoot);
    }

    async orchestrate(request: OrchestratorRequest): Promise<OrchestratorResponse> {
        const { plan, maxParallelWorkers = 4, simulateFailures = [] } = request;

        if (!plan || !plan.tasks || plan.tasks.length === 0) {
            throw new OrchestratorError("Cannot orchestrate: plan is empty or invalid");
        }

        // 1. Build execution schedule using scheduler
        const scheduler = new OrchestratorScheduler();
        const schedule = scheduler.schedule(plan);

        // 2. Execute plan schedule batches using executor
        const executor = new OrchestratorExecutor(plan, schedule, maxParallelWorkers, this.runtimeService);
        const execResult = await executor.execute(simulateFailures);

        return {
            plan,
            schedule,
            report: execResult.report,
            results: execResult.results,
            assignments: execResult.assignments
        };
    }
}

import path from "path";

export class OrchestratorService {
    constructor(private readonly workspaceRoot: string) { }

    async execute(request: { query: string }): Promise<{ context: any }> {
        const projectRoot = path.dirname(this.workspaceRoot);
        const { QueryEngineService } = await import("../query-engine/index.js");
        const engine = new QueryEngineService(projectRoot, this.workspaceRoot);
        const result = await engine.query({
            query: request.query,
            includeExecution: true,
            includeRelationships: true,
            includeGraph: true,
            includeArchitectureMemory: true
        });
        return { context: result.context };
    }
}
