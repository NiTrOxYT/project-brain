import { OrchestratorScheduler } from "./scheduler";
import { OrchestratorExecutor } from "./executor";
import { OrchestratorError } from "./errors";
import { AgentRuntimeService } from "../agent-runtime";
export class MultiAgentOrchestratorService {
    workspaceRoot;
    runtime;
    runtimeService;
    constructor(workspaceRoot, runtime) {
        this.workspaceRoot = workspaceRoot;
        this.runtime = runtime;
        this.runtimeService = new AgentRuntimeService(workspaceRoot);
    }
    async orchestrate(request) {
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
    workspaceRoot;
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    async execute(request) {
        const projectRoot = path.dirname(this.workspaceRoot);
        const { QueryEngineService } = await import("../query-engine");
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
