import { AutonomousRuntimeService } from "../autonomous-runtime/service.js";
import { ExecutionError } from "./errors.js";
export class WorkflowExecutor {
    projectRoot;
    workspaceRoot;
    workspaceEngine;
    activeRuntimeService = null;
    isCancelled = false;
    constructor(projectRoot, workspaceRoot, workspaceEngine) {
        this.projectRoot = projectRoot;
        this.workspaceRoot = workspaceRoot;
        this.workspaceEngine = workspaceEngine;
    }
    async execute(plan, metricsTracker, logJournal, options = {}) {
        console.log("DEBUG: executor.execute started");
        if (this.isCancelled) {
            throw new ExecutionError("Workflow was cancelled before execution started");
        }
        metricsTracker.startExecution();
        console.log("DEBUG: logJournal ExecutionStarted calling");
        await logJournal("ExecutionStarted", { planId: plan.goal });
        console.log("DEBUG: logJournal ExecutionStarted finished");
        this.activeRuntimeService = new AutonomousRuntimeService({
            plan,
            projectRoot: this.projectRoot,
            workspaceRoot: this.workspaceRoot,
            validators: options.validators || [],
            maxRetries: options.maxRetries ?? 3,
            maxRepairs: options.maxRepairs ?? 3
        }, {
            workspaceEngine: this.workspaceEngine
        });
        try {
            if (this.isCancelled) {
                // Access the state to set it to aborted
                const state = this.activeRuntimeService.state;
                if (state) {
                    state.activePhase = "aborted";
                }
                throw new ExecutionError("Workflow execution cancelled");
            }
            const result = await this.activeRuntimeService.execute();
            if (result.metrics) {
                metricsTracker.incrementRetries(result.metrics.retryCount);
                metricsTracker.incrementValidationCount(result.metrics.validationCount);
                metricsTracker.incrementRepairCount(result.metrics.repairCount);
                if (result.metrics.providerExecutions > 0) {
                    metricsTracker.recordProviderUsage("mock-provider", result.metrics.providerExecutions);
                }
            }
            const completedCount = result.summary?.completedTasks || 0;
            const failedCount = result.summary?.failedTasks || 0;
            const totalCount = result.summary?.totalTasks || plan.tasks.length;
            metricsTracker.setTaskCounts(totalCount, completedCount, failedCount, result.metrics?.repairCount || 0);
            if (result.status === "Aborted") {
                this.isCancelled = true;
                await logJournal("WorkflowCancelled", { reason: "Aborted by runtime" });
                throw new ExecutionError("Workflow execution aborted by runtime");
            }
            if (result.status === "Failed") {
                await logJournal("ExecutionCompleted", { status: "Failed", summary: result.summary });
                return result;
            }
            await logJournal("ExecutionCompleted", { status: "Completed", summary: result.summary });
            return result;
        }
        catch (err) {
            if (this.isCancelled) {
                await logJournal("WorkflowCancelled", { reason: err.message });
                throw new ExecutionError("Workflow execution cancelled", err);
            }
            await logJournal("ExecutionCompleted", { status: "Failed", error: err.message });
            throw new ExecutionError(`Workflow execution failed: ${err.message}`, err);
        }
        finally {
            metricsTracker.endExecution();
            this.activeRuntimeService = null;
        }
    }
    cancel() {
        this.isCancelled = true;
        if (this.activeRuntimeService) {
            try {
                const state = this.activeRuntimeService.state;
                if (state) {
                    state.activePhase = "aborted";
                }
            }
            catch { }
        }
    }
}
