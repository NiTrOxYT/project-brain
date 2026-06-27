import fs from "fs";
import path from "path";
import { RecoveryError } from "./errors";
import { WorkflowPlanner } from "./planner";
import { WorkflowScheduler } from "./scheduler";
import { WorkflowExecutor } from "./executor";
import { WorkflowJournalService } from "./journal";
import { WorkflowCheckpointService } from "./checkpoint";
import { WorkflowMetricsTracker } from "./metrics";
import { WorkflowReportGenerator } from "./report";
import { WorkspaceEngine } from "../workspace/workspace-engine";
import { LearningEngineService } from "../learning-engine/service";
import { QueryEngineService } from "../query-engine/service";
export class AutonomousWorkflowService {
    projectRoot;
    workspaceRoot;
    workspaceEngine;
    reportGenerator = new WorkflowReportGenerator();
    // Map of active workflow ID -> active executor (for cancellation support)
    static activeExecutors = new Map();
    // Map of active workflow ID -> current state
    static activeStates = new Map();
    // Map of active workflow ID -> recovery count
    static recoveryCounts = new Map();
    constructor(projectRoot, workspaceRoot) {
        this.projectRoot = projectRoot;
        this.workspaceRoot = workspaceRoot;
        this.workspaceEngine = new WorkspaceEngine({ workspaceRoot: this.workspaceRoot });
    }
    async run(request) {
        const { workflowId, issue } = request;
        AutonomousWorkflowService.activeStates.set(workflowId, "Pending");
        const journalService = new WorkflowJournalService(this.workspaceRoot, workflowId, this.workspaceEngine);
        const checkpointService = new WorkflowCheckpointService(this.workspaceRoot, workflowId, this.workspaceEngine);
        const metricsTracker = new WorkflowMetricsTracker();
        await journalService.log("WorkflowStarted", { workflowId, issue });
        try {
            // 1. Planning Phase
            AutonomousWorkflowService.activeStates.set(workflowId, "Planning");
            await journalService.log("PlanningStarted", { issue });
            metricsTracker.startPlanning();
            const planner = new WorkflowPlanner(this.projectRoot, this.workspaceRoot);
            const plan = await planner.plan(issue, request.useCache);
            metricsTracker.endPlanning();
            await journalService.log("PlanningCompleted", { plan });
            // 2. Scheduling Phase
            AutonomousWorkflowService.activeStates.set(workflowId, "Scheduling");
            const scheduler = new WorkflowScheduler();
            // Default to dependency-based schedule
            const schedule = scheduler.schedule(plan, "dependency");
            // 3. Execution & Repair Loop Phase
            AutonomousWorkflowService.activeStates.set(workflowId, "Executing");
            const executor = new WorkflowExecutor(this.projectRoot, this.workspaceRoot, this.workspaceEngine);
            AutonomousWorkflowService.activeExecutors.set(workflowId, executor);
            // Save initial checkpoint
            const initialCheckpoint = {
                workflowId,
                state: "Executing",
                plan,
                completedTasks: [],
                failedTasks: [],
                workspaceTransactionIds: {},
                providerSessions: {},
                retryCounters: {},
                repairCounters: {},
                metrics: metricsTracker.getMetrics(),
                timestamp: new Date().toISOString()
            };
            await checkpointService.save(initialCheckpoint);
            const executionResult = await executor.execute(plan, metricsTracker, async (type, payload) => journalService.log(type, payload), {
                maxRetries: request.maxRetries,
                maxRepairs: request.maxRepairs,
                validators: request.validators
            });
            AutonomousWorkflowService.activeExecutors.delete(workflowId);
            // Update checkpoint with completed tasks
            const checkpoint = checkpointService.load() || initialCheckpoint;
            checkpoint.completedTasks = executionResult.summary?.completedTasks ? Array.from({ length: executionResult.summary.completedTasks }, (_, i) => `TASK-${i + 1}`) : [];
            checkpoint.failedTasks = executionResult.summary?.failedTasks ? Array.from({ length: executionResult.summary.failedTasks }, (_, i) => `TASK-FAIL-${i + 1}`) : [];
            checkpoint.metrics = metricsTracker.getMetrics();
            await checkpointService.save(checkpoint);
            // 4. Learning Phase
            AutonomousWorkflowService.activeStates.set(workflowId, "Learning");
            await journalService.log("LearningStarted");
            let learningSummary;
            let recommendations = null;
            try {
                const learningEngine = new LearningEngineService(this.workspaceRoot);
                const learnResult = await learningEngine.learn(executionResult);
                learningSummary = {
                    recordsAdded: learnResult.recordsAdded,
                    success: learnResult.success
                };
                const rec = await learningEngine.recommend({
                    taskTitle: issue,
                    taskType: "modify"
                });
                recommendations = {
                    recommendedProvider: rec.recommendedProvider,
                    recommendedRepairStrategy: rec.recommendedRepairStrategy,
                    recommendedPrompt: rec.recommendedPrompt,
                    rulesApplied: rec.rulesApplied
                };
            }
            catch {
                // best-effort
            }
            await journalService.log("LearningCompleted", { learningSummary });
            // 5. Final Report Generation
            const status = executionResult.status === "Completed" ? "Completed" : "Failed";
            AutonomousWorkflowService.activeStates.set(workflowId, status);
            const finalMetrics = metricsTracker.getMetrics();
            const diagnostics = this.getWorkflowDiagnostics(workflowId);
            const report = this.reportGenerator.generate(workflowId, issue, status, plan, journalService.read(), finalMetrics, diagnostics, recommendations);
            // Save report file via WorkspaceEngine
            const reportPath = path.join(this.workspaceRoot, ".brain", "workflows", workflowId, "report.json");
            const txReport = this.workspaceEngine.beginTransaction();
            this.workspaceEngine.stage(txReport.id, {
                kind: "WriteFile",
                path: reportPath,
                content: JSON.stringify(report, null, 2)
            });
            await this.workspaceEngine.commit(txReport.id);
            // Store workflow diagnostics in QueryEngine context database
            try {
                const queryEngine = new QueryEngineService(this.projectRoot, this.workspaceRoot);
                const queryTx = this.workspaceEngine.beginTransaction();
                this.workspaceEngine.stage(queryTx.id, {
                    kind: "WriteFile",
                    path: path.join(this.workspaceRoot, "context", `workflow-diag-${workflowId}.json`),
                    content: JSON.stringify({ workflowId, diagnostics, report }, null, 2)
                });
                await this.workspaceEngine.commit(queryTx.id);
            }
            catch { }
            if (status === "Completed") {
                await checkpointService.clear();
                await journalService.log("WorkflowCompleted", { report });
            }
            else {
                await journalService.log("WorkflowFailed", { report });
            }
            return {
                workflowId,
                status,
                report
            };
        }
        catch (err) {
            AutonomousWorkflowService.activeStates.set(workflowId, "Failed");
            await journalService.log("WorkflowFailed", { error: err.message });
            const finalMetrics = metricsTracker.getMetrics();
            const diagnostics = this.getWorkflowDiagnostics(workflowId);
            const report = this.reportGenerator.generate(workflowId, issue, "Failed", null, journalService.read(), finalMetrics, diagnostics, null);
            return {
                workflowId,
                status: "Failed",
                report
            };
        }
    }
    async resume(workflowId) {
        AutonomousWorkflowService.activeStates.set(workflowId, "Recovered");
        const recoveryCount = (AutonomousWorkflowService.recoveryCounts.get(workflowId) || 0) + 1;
        AutonomousWorkflowService.recoveryCounts.set(workflowId, recoveryCount);
        const checkpointService = new WorkflowCheckpointService(this.workspaceRoot, workflowId, this.workspaceEngine);
        const journalService = new WorkflowJournalService(this.workspaceRoot, workflowId, this.workspaceEngine);
        const checkpoint = checkpointService.load();
        if (!checkpoint || !checkpoint.plan) {
            throw new RecoveryError(`No valid checkpoint found for workflow ${workflowId}`);
        }
        await journalService.log("WorkflowRecovered", { workflowId, recoveryCount });
        // Resume workflow from checkpoint plan
        const plan = checkpoint.plan;
        AutonomousWorkflowService.activeStates.set(workflowId, "Executing");
        const metricsTracker = new WorkflowMetricsTracker();
        const executor = new WorkflowExecutor(this.projectRoot, this.workspaceRoot, this.workspaceEngine);
        AutonomousWorkflowService.activeExecutors.set(workflowId, executor);
        try {
            const executionResult = await executor.execute(plan, metricsTracker, async (type, payload) => journalService.log(type, payload), {
                validators: []
            });
            AutonomousWorkflowService.activeExecutors.delete(workflowId);
            // Transition state to completed/failed
            const status = executionResult.status === "Completed" ? "Completed" : "Failed";
            AutonomousWorkflowService.activeStates.set(workflowId, status);
            const finalMetrics = metricsTracker.getMetrics();
            const diagnostics = this.getWorkflowDiagnostics(workflowId);
            const report = this.reportGenerator.generate(workflowId, plan.goal, status, plan, journalService.read(), finalMetrics, diagnostics, null);
            if (status === "Completed") {
                await checkpointService.clear();
                await journalService.log("WorkflowCompleted", { report });
            }
            else {
                await journalService.log("WorkflowFailed", { report });
            }
            return {
                workflowId,
                status,
                report
            };
        }
        catch (err) {
            AutonomousWorkflowService.activeStates.set(workflowId, "Failed");
            await journalService.log("WorkflowFailed", { error: err.message });
            const finalMetrics = metricsTracker.getMetrics();
            const diagnostics = this.getWorkflowDiagnostics(workflowId);
            const report = this.reportGenerator.generate(workflowId, plan.goal, "Failed", plan, journalService.read(), finalMetrics, diagnostics, null);
            return {
                workflowId,
                status: "Failed",
                report
            };
        }
    }
    async cancel(workflowId) {
        const executor = AutonomousWorkflowService.activeExecutors.get(workflowId);
        if (executor) {
            executor.cancel();
            AutonomousWorkflowService.activeExecutors.delete(workflowId);
        }
        AutonomousWorkflowService.activeStates.set(workflowId, "Cancelled");
        const journalService = new WorkflowJournalService(this.workspaceRoot, workflowId, this.workspaceEngine);
        await journalService.log("WorkflowCancelled", { reason: "User request" });
    }
    status(workflowId) {
        const state = AutonomousWorkflowService.activeStates.get(workflowId) || "Pending";
        return {
            workflowId,
            state
        };
    }
    history() {
        const historyDir = path.join(this.workspaceRoot, ".brain", "workflows");
        if (!fs.existsSync(historyDir)) {
            return [];
        }
        try {
            const dirs = fs.readdirSync(historyDir);
            return dirs.map(dir => {
                const checkpointPath = path.join(historyDir, dir, "checkpoint.json");
                let state = "Completed";
                let timestamp = new Date().toISOString();
                if (fs.existsSync(checkpointPath)) {
                    try {
                        const data = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
                        state = data.state || "Pending";
                        timestamp = data.timestamp || timestamp;
                    }
                    catch { }
                }
                return {
                    workflowId: dir,
                    state,
                    timestamp
                };
            });
        }
        catch {
            return [];
        }
    }
    report(workflowId) {
        const reportPath = path.join(this.workspaceRoot, ".brain", "workflows", workflowId, "report.json");
        if (!fs.existsSync(reportPath)) {
            return null;
        }
        try {
            return JSON.parse(fs.readFileSync(reportPath, "utf8"));
        }
        catch {
            return null;
        }
    }
    diagnostics(workflowId) {
        return this.getWorkflowDiagnostics(workflowId);
    }
    getWorkflowDiagnostics(workflowId) {
        const recoveryCount = AutonomousWorkflowService.recoveryCounts.get(workflowId) || 0;
        const state = AutonomousWorkflowService.activeStates.get(workflowId) || "Pending";
        const workspaceDiagnostics = this.workspaceEngine.diagnostics();
        const activeLocks = []; // normally workspaceDiagnostics.activeLocks or similar
        return {
            workflowId,
            interrupted: recoveryCount > 0,
            recoveryCount,
            activeLocks,
            lastActivePhase: state
        };
    }
}
