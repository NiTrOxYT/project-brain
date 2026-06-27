// ──────────────────────────────────────────────────────────────────────────────
// BUILD-051 — Autonomous Execution Loop — Core Service
// ──────────────────────────────────────────────────────────────────────────────
import { SharedMemoryService } from "../shared-memory/index.js";
import {
    ExecutionLoopRequest,
    ExecutionLoopResult,
    ExecutionPhase,
    ExecutionCheckpoint,
    ExecutionState,
    ExecutionFailure,
    ValidationResult,
    LoopMetrics,
    ExecutionSummary,
    ValidatorConfig
} from "./types.js";
import { AutonomousRuntimeError } from "./errors.js";
import { ValidationService } from "./validator.js";
import { FailureAnalyzer } from "./failure-analyzer.js";
import { RepairService } from "./repair.js";
import { ExecutionCheckpointService } from "./checkpoint.js";
import { ExecutionJournalService } from "./journal.js";
import { ExecutionRecoveryService } from "./recovery.js";
import { ExecutionMetricsService } from "./metrics.js";

import { AgentRuntimeService, RuntimeRequest } from "../agent-runtime/index.js";
import { WorkspaceEngine } from "../workspace/workspace-engine.js";
import { ProviderExecutionService } from "../provider-execution/service.js";
import { OrchestratorScheduler } from "../orchestrator/scheduler.js";
import { EngineeringPlan, ExecutionNode } from "../engineering-planner/types.js";
import { ContextSynchronizationService } from "../context-sync/index.js";

function getPlanId(plan: EngineeringPlan): string {
    return plan.goal.toLowerCase().replace(/[^a-z0-9]+/g, "-").substring(0, 50);
}

export class AutonomousRuntimeService {
    private sharedMem: SharedMemoryService | null = null;
    private readonly projectRoot: string;
    private readonly workspaceRoot: string;
    private readonly validators: ValidatorConfig[];
    private readonly maxRetries: number;
    private readonly maxRepairs: number;
    private readonly retryBackoffMs: number;

    private readonly execService: ProviderExecutionService;
    private readonly workspaceEngine: WorkspaceEngine;
    private readonly runtimeService: AgentRuntimeService;

    private checkpointService!: ExecutionCheckpointService;
    private journalService!: ExecutionJournalService;
    private readonly recoveryService = new ExecutionRecoveryService();
    private metricsService!: ExecutionMetricsService;
    private readonly validatorService: ValidationService;
    private readonly failureAnalyzer = new FailureAnalyzer();
    private readonly repairService = new RepairService();

    private state!: ExecutionState;
    private plan!: EngineeringPlan;

    constructor(
        config: ExecutionLoopRequest,
        services?: {
            execService?: ProviderExecutionService;
            workspaceEngine?: WorkspaceEngine;
            runtimeService?: AgentRuntimeService;
        }
    ) {
        this.projectRoot = config.projectRoot;
        this.workspaceRoot = config.workspaceRoot;
        this.validators = config.validators || [];
        this.maxRetries = config.maxRetries ?? 3;
        this.maxRepairs = config.maxRepairs ?? 3;
        this.retryBackoffMs = config.retryBackoffMs ?? 50;

        this.execService = services?.execService || new ProviderExecutionService();
        this.workspaceEngine = services?.workspaceEngine || new WorkspaceEngine({ workspaceRoot: this.workspaceRoot });
        this.runtimeService = services?.runtimeService || new AgentRuntimeService(this.workspaceRoot, this.workspaceEngine);
        this.validatorService = new ValidationService(this.execService);

        if (config.plan) {
            this.plan = config.plan;
            const planId = getPlanId(this.plan);
            this.checkpointService = new ExecutionCheckpointService(this.workspaceRoot, planId);
            this.journalService = new ExecutionJournalService(this.workspaceRoot, planId);
        }
    }

    async execute(plan?: EngineeringPlan): Promise<ExecutionLoopResult> {
        if (plan) {
            this.plan = plan;
        }
        if (!this.plan) {
            throw new AutonomousRuntimeError("No plan provided for execution");
        }

        const planId = getPlanId(this.plan);
        this.checkpointService = new ExecutionCheckpointService(this.workspaceRoot, planId);
        this.journalService = new ExecutionJournalService(this.workspaceRoot, planId);

        // 1. Load checkpoint if exists to resume or start fresh
        const checkpoint = this.checkpointService.load();

        if (checkpoint) {
            this.state = this.recoveryService.recover(checkpoint);
            this.metricsService = new ExecutionMetricsService(this.state.metrics);
            await this.journalService.log("CheckpointLoaded", { planId });
            if (this.state.activePhase === "failed" || this.state.activePhase === "loading") {
                this.state.activePhase = "executing";
            }
        } else {
            const initialMetrics: LoopMetrics = {
                durationMs: 0,
                repairCount: 0,
                retryCount: 0,
                validationCount: 0,
                providerExecutions: 0,
                workspaceTransactions: 0,
                successRate: 0,
                failureRate: 0,
                timePerPhase: {}
            };
            this.state = {
                planId,
                completedTasks: new Set(),
                failedTasks: new Set(),
                activePhase: "loading",
                workspaceTransactionIds: new Map(),
                providerSessions: new Map(),
                retryCounters: new Map(),
                repairCounters: new Map(),
                metrics: initialMetrics,
                failures: [],
                journal: []
            };
            this.metricsService = new ExecutionMetricsService();
        }

        this.metricsService.startPhase(this.state.activePhase);
        await this.journalService.log("PhaseStarted", { phase: this.state.activePhase });

        if (this.state.activePhase === "loading") {
            this.metricsService.endPhase("loading");
            await this.journalService.log("PhaseCompleted", { phase: "loading" });
            this.state.activePhase = "executing";
            this.metricsService.startPhase("executing");
            await this.journalService.log("PhaseStarted", { phase: "executing" });
            this.checkpointService.save(this.getCheckpoint());
        }

        // Map tasks
        const taskMap = new Map<string, ExecutionNode>();
        for (const t of this.plan.tasks) {
            taskMap.set(t.id, t);
        }

        // Initialize Shared Memory and register tasks
        let sharedMem: any = null;
        try {
            this.sharedMem = new SharedMemoryService(
                this.projectRoot,
                this.workspaceRoot
            );

            this.sharedMem.setPhase("Execution");

            for (const t of this.plan.tasks) {
                this.sharedMem.addTask({
                    id: t.id,
                    title: t.title,
                    type: t.type,
                    status: this.state.completedTasks.has(t.id) ? "Completed" : "Pending",
                    prerequisites: t.prerequisites
                });
            }
        } catch {
            this.sharedMem = null;
        }

        const scheduler = new OrchestratorScheduler();
        const schedule = scheduler.schedule(this.plan);

        // Execute schedule batches
        for (const batch of schedule.batches) {
            if (this.state.activePhase === "failed" || this.state.activePhase === "aborted") {
                break;
            }

            const tasksToRun = batch.taskIds.filter(tId => !this.state.completedTasks.has(tId));
            if (tasksToRun.length === 0) continue;

            const runnableTasks: string[] = [];
            for (const tId of tasksToRun) {
                const node = taskMap.get(tId)!;
                let preFailed = false;
                for (const pre of node.prerequisites) {
                    if (this.state.failedTasks.has(pre)) {
                        preFailed = true;
                        break;
                    }
                }
                if (preFailed) {
                    this.state.failedTasks.add(tId);
                    await this.journalService.log("TaskFailed", { taskId: tId, reason: "Prerequisite failed" });
                } else {
                    runnableTasks.push(tId);
                }
            }

            if (runnableTasks.length === 0) continue;

            // Run tasks in parallel
            console.log("DEBUG: Running runnableTasks:", runnableTasks);
            const batchPromises = runnableTasks.map(async (tId) => {
                const node = taskMap.get(tId)!;

                // Wait on Shared Memory dependency barriers
                if (this.sharedMem) {
                    try {
                        console.log(`DEBUG: waitBarrier calling for node ${tId}`);
                        let ready = false;
                        while (!ready) {
                            ready = await this.sharedMem.waitBarrier(node.prerequisites);
                            if (!ready) {
                                console.log(`DEBUG: waitBarrier not ready for node ${tId}, waiting...`);
                                await new Promise(resolve => setTimeout(resolve, 50));
                            }
                        }
                        console.log(`DEBUG: waitBarrier ready for node ${tId}`);
                    } catch (err: any) {
                        console.log(`DEBUG: waitBarrier error for node ${tId}:`, err.message);
                    }
                }

                console.log(`DEBUG: executeTaskAndRepair calling for node ${tId}`);
                await this.executeTaskAndRepair(node);
                console.log(`DEBUG: executeTaskAndRepair finished for node ${tId}`);
            });

            await Promise.all(batchPromises);
            console.log("DEBUG: runnableTasks finished");

            // Check failures in batch
            const hasFailures = runnableTasks.some(tId => this.state.failedTasks.has(tId));
            if (hasFailures) {
                this.state.activePhase = "failed";
                this.metricsService.endPhase("executing");
                await this.journalService.log("PhaseCompleted", { phase: "executing" });
                this.checkpointService.save(this.getCheckpoint());
                break;
            }
        }

        if (this.state.activePhase !== "failed" && this.state.activePhase !== "aborted") {
            this.state.activePhase = "completed";
            this.metricsService.endPhase("executing");
            await this.journalService.log("PhaseCompleted", { phase: "executing" });
        }

        const finalMetrics = this.metricsService.getMetrics(
            this.plan.tasks.length,
            this.state.completedTasks.size,
            this.state.failedTasks.size
        );
        this.state.metrics = finalMetrics;

        const summary: ExecutionSummary = {
            totalTasks: this.plan.tasks.length,
            completedTasks: this.state.completedTasks.size,
            failedTasks: this.state.failedTasks.size,
            repairedCount: finalMetrics.repairCount,
            retriedCount: finalMetrics.retryCount,
            validationFailures: finalMetrics.validationCount - this.state.completedTasks.size,
            durationMs: finalMetrics.durationMs,
            successPercentage: finalMetrics.successRate
        };

        const status: "Completed" | "Failed" | "Aborted" = this.state.activePhase === "completed"
            ? "Completed"
            : (this.state.activePhase === "aborted" ? "Aborted" : "Failed");

        if (status === "Completed") {
            this.checkpointService.clear();
        } else {
            this.checkpointService.save(this.getCheckpoint());
        }

        await this.journalService.log(status === "Completed" ? "ExecutionCompleted" : "ExecutionFailed", { summary });

        const result = {
            planId,
            status,
            summary,
            metrics: finalMetrics,
            errors: this.state.failures,
            journal: this.journalService.read()
        };

        try {
            const { LearningEngineService } = await import("../learning-engine/index.js");
            const learningEngine = new LearningEngineService(this.workspaceRoot);
            await learningEngine.learn(result);
        } catch (err) {
            // Ignore learning errors to preserve runtime robustness
        }

        return result;
    }

    private async executeTaskAndRepair(node: ExecutionNode): Promise<void> {
        const taskId = node.id;
        this.state.failedTasks.delete(taskId);
        await this.journalService.log("TaskStarted", {
            taskId,
            taskType: node.type,
            taskTitle: node.title,
            taskFile: node.file
        });

        let executionResponse: any;
        let retries = 0;

        while (true) {
            try {
                this.metricsService.incrementProviderExecutions();
                const request: RuntimeRequest = {
                    task: {
                        id: taskId,
                        type: node.type as any,
                        title: node.title,
                        file: node.file,
                        symbol: node.symbol,
                        status: "Running",
                        prerequisites: node.prerequisites
                    },
                    context: {
                        workspaceRoot: this.workspaceRoot,
                        sessionId: this.state.providerSessions.get(node.type)
                    }
                };

                const response = await this.runtimeService.execute(request, () => { });

                if (response.workspaceTransactionId) {
                    this.state.workspaceTransactionIds.set(taskId, response.workspaceTransactionId);
                    this.metricsService.incrementWorkspaceTransactions();
                    await this.journalService.log("WorkspaceTransactionApplied", {
                        taskId,
                        transactionId: response.workspaceTransactionId
                    });

                    // Trigger incremental context synchronization after each workspace commit
                    // Fire-and-forget — does not block execution loop
                    try {
                        const syncService = new ContextSynchronizationService(
                            this.projectRoot,
                            this.workspaceRoot
                        );
                        syncService.syncIncremental().catch(() => { /* best-effort */ });
                    } catch { /* best-effort */ }
                }

                if (response.status === "Completed") {
                    executionResponse = response;
                    break;
                } else {
                    throw new Error(response.error || "Task execution failed");
                }
            } catch (err: any) {
                const failure = this.failureAnalyzer.analyze("executing", err, taskId);

                if ((failure.category === "Transient" || failure.category === "Timeout") && retries < this.maxRetries) {
                    retries++;
                    this.state.retryCounters.set(taskId, retries);
                    this.metricsService.incrementRetries();
                    await this.journalService.log("RetryStarted", {
                        taskId,
                        attempt: retries,
                        delayMs: this.retryBackoffMs * Math.pow(2, retries - 1)
                    });
                    await this.sleep(this.retryBackoffMs * Math.pow(2, retries - 1));
                    continue;
                }

                this.state.failures.push(failure);
                this.state.failedTasks.add(taskId);

                if (this.sharedMem) {
                    await this.sharedMem.completeTask(taskId, false);
                }

                await this.journalService.log("TaskFailed", {
                    taskId,
                    reason: failure.message
                });

                this.checkpointService.save(this.getCheckpoint());

                return;
            }
        }

        // If the task modifies files, run validators
        const isModifying = ["create", "modify", "refactor", "delete"].includes(node.type);
        if (!isModifying) {
            this.state.completedTasks.add(taskId);

            if (this.sharedMem) {
                await this.sharedMem.completeTask(taskId, true);
            }

            await this.journalService.log("TaskCompleted", { taskId });

            this.checkpointService.save(this.getCheckpoint());

            return;
        }

        let repairAttempts = 0;
        let validationResults: ValidationResult[] = [];

        while (true) {
            this.metricsService.incrementValidations();
            await this.journalService.log("ValidationStarted", { taskId });

            validationResults = await this.validatorService.validate(
                this.workspaceRoot,
                this.validators,
                this.workspaceEngine,
                node.file ? [node.file] : (node.affectedFiles || [])
            );

            const allPassed = validationResults.every(r => r.success);

            if (allPassed) {
                this.state.completedTasks.add(taskId);

                if (this.sharedMem) {
                    await this.sharedMem.completeTask(taskId, true);
                }

                await this.journalService.log("ValidationPassed", { taskId });

                await this.journalService.log("TaskCompleted", { taskId });

                this.checkpointService.save(this.getCheckpoint());

                return;
            }

            const failedResult = validationResults.find(r => !r.success)!;
            const failure = this.failureAnalyzer.analyze("validating", new Error(failedResult.message), taskId);
            this.state.failures.push(failure);

            await this.journalService.log("ValidationFailed", {
                taskId,
                errors: failedResult.errors || [failedResult.message]
            });

            if (repairAttempts >= this.maxRepairs) {
                this.state.failedTasks.add(taskId);

                if (this.sharedMem) {
                    await this.sharedMem.completeTask(taskId, false);
                }

                await this.journalService.log("TaskFailed", {
                    taskId,
                    reason: "Repair attempts exhausted"
                });

                this.checkpointService.save(this.getCheckpoint());

                return;
            }

            repairAttempts++;
            this.state.repairCounters.set(taskId, repairAttempts);
            this.metricsService.incrementRepairs();
            await this.journalService.log("RepairStarted", { taskId, attempt: repairAttempts });

            const repairAction = this.repairService.createRepairAction(failure, node, this.workspaceRoot);

            try {
                // Retrieve fresh context for the repair action using current snapshot, task, and failure details
                try {
                    const { ContextRetrievalService } = await import("../context-retrieval/index.js");
                    const retrievalService = new ContextRetrievalService(this.projectRoot, this.workspaceRoot);
                    const res = await retrievalService.retrieve({
                        query: `${repairAction.newRequest.task.title} due to ${failure.category}: ${failure.message}`,
                        providerId: "claude-code"
                    });
                    (repairAction.newRequest.context as any).retrievalPackage = res.retrievalPackage;
                } catch { /* best-effort */ }

                this.metricsService.incrementProviderExecutions();
                const repairRes = await this.runtimeService.execute(repairAction.newRequest, () => { });
                if (repairRes.workspaceTransactionId) {
                    this.state.workspaceTransactionIds.set(taskId, repairRes.workspaceTransactionId);
                    this.metricsService.incrementWorkspaceTransactions();
                    await this.journalService.log("WorkspaceTransactionApplied", {
                        taskId,
                        transactionId: repairRes.workspaceTransactionId
                    });
                }

                if (repairRes.status !== "Completed") {
                    throw new Error(repairRes.error || "Repair execution failed");
                }
                await this.journalService.log("RepairCompleted", { taskId, attempt: repairAttempts });
            } catch (err: any) {
                await this.journalService.log("ValidationFailed", { taskId, errors: [err.message] });
            }
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private getCheckpoint(): ExecutionCheckpoint {
        return {
            planId: this.state.planId,
            completedTasks: Array.from(this.state.completedTasks),
            failedTasks: Array.from(this.state.failedTasks),
            activePhase: this.state.activePhase,
            workspaceTransactionIds: Object.fromEntries(this.state.workspaceTransactionIds.entries()),
            providerSessions: Object.fromEntries(this.state.providerSessions.entries()),
            retryCounters: Object.fromEntries(this.state.retryCounters.entries()),
            repairCounters: Object.fromEntries(this.state.repairCounters.entries()),
            metrics: this.metricsService.getMetrics(
                this.plan.tasks.length,
                this.state.completedTasks.size,
                this.state.failedTasks.size
            ),
            timestamp: new Date().toISOString()
        };
    }
}
