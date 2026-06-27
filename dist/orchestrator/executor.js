import { AgentRuntimeService } from "../agent-runtime/index.js";
export class OrchestratorExecutor {
    plan;
    schedule;
    maxWorkers;
    workspaceEngine;
    stage = "init";
    results = [];
    assignments = [];
    retryCounts = new Map();
    // Diagnostic metrics
    retries = 0;
    rollbackCount = 0;
    totalExecutionTime = 0;
    runtimeService;
    constructor(plan, schedule, maxWorkers = 4, runtimeService, workspaceEngine) {
        this.plan = plan;
        this.schedule = schedule;
        this.maxWorkers = maxWorkers;
        this.workspaceEngine = workspaceEngine;
        this.runtimeService = runtimeService || new AgentRuntimeService(process.cwd(), workspaceEngine);
    }
    async execute(simulateFailures = []) {
        this.stage = "running";
        this.results = [];
        this.assignments = [];
        this.retryCounts.clear();
        this.retries = 0;
        this.rollbackCount = 0;
        this.totalExecutionTime = 0;
        const startTime = Date.now();
        // Map task IDs to task definitions
        const taskMap = new Map();
        for (const t of this.plan.tasks) {
            taskMap.set(t.id, t);
        }
        const failedTasks = new Set();
        const completedTasks = new Set();
        const skippedTasks = new Set();
        // Process batches sequentially
        for (const batch of this.schedule.batches) {
            if (this.stage === "failed" || this.stage === "rollback") {
                break;
            }
            // Check if any task in this batch has prerequisites that failed or were skipped
            const tasksToRun = [];
            for (const tId of batch.taskIds) {
                const task = taskMap.get(tId);
                let shouldSkip = false;
                for (const pre of task.prerequisites) {
                    if (failedTasks.has(pre) || skippedTasks.has(pre)) {
                        shouldSkip = true;
                        break;
                    }
                }
                if (shouldSkip) {
                    skippedTasks.add(tId);
                    this.results.push({
                        taskId: tId,
                        status: "skipped",
                        executionTimeMs: 0
                    });
                }
                else {
                    tasksToRun.push(tId);
                }
            }
            if (tasksToRun.length === 0)
                continue;
            // Run tasks in the batch in parallel up to maxWorkers
            const workersCount = Math.min(this.maxWorkers, tasksToRun.length);
            const activeWorkers = Array.from({ length: workersCount }, (_, i) => `WORKER-${String(i + 1).padStart(6, "0")}`);
            // Simulate parallel execution of tasksToRun
            const batchPromises = tasksToRun.map(async (tId, idx) => {
                const workerId = activeWorkers[idx % activeWorkers.length];
                this.assignments.push({ taskId: tId, workerId });
                const task = taskMap.get(tId);
                const runStart = Date.now();
                // Evaluate simulated failure rules
                const failureRule = simulateFailures.find(f => f.startsWith(tId));
                let simulateFailure = false;
                let shouldSucceedOnRetry = false;
                if (failureRule) {
                    if (failureRule.endsWith("-retry")) {
                        simulateFailure = true;
                        shouldSucceedOnRetry = true;
                    }
                    else if (failureRule.endsWith("-fail") || failureRule === tId) {
                        simulateFailure = true;
                        shouldSucceedOnRetry = false;
                    }
                }
                const request = {
                    task: {
                        id: tId,
                        type: task.type,
                        title: task.title,
                        file: task.file,
                        symbol: task.symbol,
                        status: "Running",
                        prerequisites: task.prerequisites,
                        estimatedLOC: task.estimatedLOC,
                        estimatedTokens: task.estimatedTokens
                    },
                    context: {
                        workspaceRoot: this.runtimeService.workspaceRoot || process.cwd(),
                        simulateFailure
                    }
                };
                const response = await this.runtimeService.execute(request, (event) => {
                    if (event.type === "RetryStarted") {
                        this.retries++;
                        if (shouldSucceedOnRetry) {
                            request.context.simulateFailure = false;
                        }
                    }
                });
                this.totalExecutionTime += response.metrics.executionTime;
                if (response.status === "Completed") {
                    completedTasks.add(tId);
                    this.results.push({
                        taskId: tId,
                        status: "completed",
                        executionTimeMs: Date.now() - runStart,
                        workspaceTransactionId: response.workspaceTransactionId
                    });
                }
                else {
                    failedTasks.add(tId);
                    this.results.push({
                        taskId: tId,
                        status: "failed",
                        error: response.error || "Task execution failed",
                        executionTimeMs: Date.now() - runStart
                    });
                }
            });
            await Promise.all(batchPromises);
            // If any task in the batch failed permanently, propagate failure and trigger rollback
            if (failedTasks.size > 0) {
                this.stage = "rollback";
                break;
            }
        }
        // Propagate skips to all remaining unscheduled downstream tasks
        if (this.stage === "rollback") {
            const activeTasks = this.plan.tasks.filter((t) => !t.isRollback);
            const allUnscheduled = activeTasks.filter((t) => !completedTasks.has(t.id) && !failedTasks.has(t.id) && !skippedTasks.has(t.id));
            for (const t of allUnscheduled) {
                skippedTasks.add(t.id);
                this.results.push({
                    taskId: t.id,
                    status: "skipped",
                    executionTimeMs: 0
                });
            }
            // Run Rollbacks in reverse order of completion
            const completedList = Array.from(completedTasks).reverse();
            for (const compId of completedList) {
                const originalTask = taskMap.get(compId);
                if (originalTask.rollbackTaskId) {
                    const rollbackNode = this.plan.tasks.find(t => t.id === originalTask.rollbackTaskId);
                    if (rollbackNode) {
                        this.rollbackCount++;
                        this.assignments.push({
                            taskId: rollbackNode.id,
                            workerId: "ROLLBACK-WORKER"
                        });
                        const rollbackRequest = {
                            task: {
                                id: rollbackNode.id,
                                type: rollbackNode.type,
                                title: rollbackNode.title,
                                file: rollbackNode.file,
                                symbol: rollbackNode.symbol,
                                status: "Running",
                                prerequisites: rollbackNode.prerequisites,
                                estimatedLOC: rollbackNode.estimatedLOC,
                                estimatedTokens: rollbackNode.estimatedTokens
                            },
                            context: {
                                workspaceRoot: this.runtimeService.workspaceRoot || process.cwd()
                            }
                        };
                        const response = await this.runtimeService.execute(rollbackRequest);
                        this.totalExecutionTime += response.metrics.executionTime;
                        this.results.push({
                            taskId: rollbackNode.id,
                            status: response.status === "Completed" ? "completed" : "failed",
                            error: response.error,
                            executionTimeMs: response.metrics.executionTime
                        });
                    }
                }
            }
            this.stage = "failed";
        }
        else {
            this.stage = "completed";
        }
        const report = this.generateReport(startTime);
        return {
            stage: this.stage,
            results: this.results,
            assignments: this.assignments,
            report
        };
    }
    generateReport(startTime) {
        const totalTasks = this.plan.tasks.length;
        const completedTasks = this.results.filter(r => r.status === "completed").length;
        const failedTasks = this.results.filter(r => r.status === "failed").length;
        const skippedTasks = this.results.filter(r => r.status === "skipped").length;
        // Parallelism calculation: total tasks executed in batches / number of batches
        const activeBatchesCount = this.schedule.batches.length;
        const parallelism = activeBatchesCount > 0
            ? parseFloat((this.plan.tasks.filter(t => !t.isRollback).length / activeBatchesCount).toFixed(2))
            : 1.0;
        // Depth: total stages in phase sequence
        const executionDepth = new Set(this.plan.tasks.map(t => t.phaseId)).size;
        const runtimeDiags = typeof this.runtimeService.diagnostics === "function" ? this.runtimeService.diagnostics() : undefined;
        const providersList = typeof this.runtimeService.providers === "function" ? this.runtimeService.providers() : [];
        let selectedProvider = "Mock Agent Provider";
        let providerHealth = "Healthy";
        if (runtimeDiags?.providerSelectionReasoning && runtimeDiags.providerSelectionReasoning.length > 0) {
            const match = runtimeDiags.providerSelectionReasoning[0].match(/Selected '([^']+)'/);
            if (match) {
                selectedProvider = match[1];
            }
        }
        else if (providersList.length > 0) {
            selectedProvider = providersList[0].name;
        }
        const matchedProvider = providersList.find((p) => p.name === selectedProvider || p.id === selectedProvider);
        if (matchedProvider) {
            providerHealth = matchedProvider.health || "Healthy";
        }
        const executionSnapshotId = runtimeDiags?.snapshotStatistics?.lastSnapshotId;
        // Aggregate workspace diagnostics if engine is present
        let workspaceDiagnostics;
        if (this.workspaceEngine) {
            const wsDiag = this.workspaceEngine.diagnostics?.();
            if (wsDiag) {
                workspaceDiagnostics = {
                    totalTransactions: wsDiag.totalTransactions,
                    totalChanges: wsDiag.totalChanges,
                    totalPatchesApplied: wsDiag.totalPatchesApplied,
                    rolledBackTransactions: wsDiag.rolledBackTransactions
                };
            }
        }
        return {
            totalTasks,
            completedTasks,
            failedTasks,
            skippedTasks,
            parallelism,
            executionDepth,
            criticalPathLength: activeBatchesCount,
            retries: this.retries,
            rollbackCount: this.rollbackCount,
            executionTime: Date.now() - startTime,
            selectedProvider,
            providerHealth,
            runtimeMetricsSummary: runtimeDiags,
            executionSnapshotId,
            workspaceDiagnostics
        };
    }
}
