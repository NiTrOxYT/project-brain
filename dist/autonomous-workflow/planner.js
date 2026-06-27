import { ContextSynchronizationService } from "../context-sync/service.js";
import { ContextRetrievalService } from "../context-retrieval/service.js";
import { EngineeringPlannerService } from "../engineering-planner/service.js";
import { PlanningError } from "./errors.js";
export class WorkflowPlanner {
    projectRoot;
    workspaceRoot;
    constructor(projectRoot, workspaceRoot) {
        this.projectRoot = projectRoot;
        this.workspaceRoot = workspaceRoot;
    }
    async plan(issue, useCache = true) {
        try {
            // 1. Synchronize Context Incremental
            const syncService = new ContextSynchronizationService(this.projectRoot, this.workspaceRoot);
            await syncService.syncIncremental();
            // 2. Retrieve Minimal Semantic Context
            const retrievalService = new ContextRetrievalService(this.projectRoot, this.workspaceRoot);
            const retrievalResult = await retrievalService.retrieve({
                query: issue,
                useCache,
                maxTokens: 5000 // minimal target centric
            });
            // Map retrieval candidates to format expected by engineering planner
            const candidates = (retrievalResult.retrievalPackage?.candidates || []).map(c => ({
                id: c.path,
                type: "file",
                score: c.score
            }));
            // 3. Run Engineering Planner
            const plannerService = new EngineeringPlannerService(this.projectRoot, this.workspaceRoot);
            const plan = await plannerService.plan({
                query: issue,
                intent: "feature",
                candidates
            });
            return plan;
        }
        catch (err) {
            throw new PlanningError(`Workflow planning failed: ${err.message}`, err);
        }
    }
}
