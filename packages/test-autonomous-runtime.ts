// ──────────────────────────────────────────────────────────────────────────────
// BUILD-051 — Autonomous Execution Loop — Verification Suite
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import os from "os";

import { AutonomousRuntimeService } from "./autonomous-runtime/service";
import { ValidationService } from "./autonomous-runtime/validator";
import { FailureAnalyzer } from "./autonomous-runtime/failure-analyzer";
import { RepairService } from "./autonomous-runtime/repair";
import { ExecutionCheckpointService } from "./autonomous-runtime/checkpoint";
import { ExecutionJournalService } from "./autonomous-runtime/journal";
import { ExecutionRecoveryService } from "./autonomous-runtime/recovery";
import { ExecutionMetricsService } from "./autonomous-runtime/metrics";
import { AutonomousRuntimeError } from "./autonomous-runtime/errors";
import { ExecutionLoopRequest, ValidationResult } from "./autonomous-runtime/types";

import { AgentRuntimeService, RuntimeRequest } from "./agent-runtime";
import { WorkspaceEngine } from "./workspace/workspace-engine";
import { ProviderExecutionService } from "./provider-execution/service";
import { EngineeringPlan, ExecutionNode } from "./engineering-planner/types";

let passed = 0;
let failed = 0;
const errors: string[] = [];

function assert(condition: boolean, message: string): void {
    if (!condition) {
        failed++;
        errors.push(`FAIL: ${message}`);
        console.error(`  ✗ FAIL: ${message}`);
    } else {
        passed++;
        console.log(`  ✓ ${message}`);
    }
}

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "brain-auto-run-"));
}

function cleanup(dir: string): void {
    try {
        fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
}

function makeNode(id: string, phaseId: string = "PHASE-1", type: string = "create", prerequisites: string[] = []): ExecutionNode {
    return {
        id,
        title: `Task ${id}`,
        description: `Description of ${id}`,
        type: type as any,
        phaseId,
        file: id === "task-1" ? "output.txt" : "output2.txt",
        prerequisites,
        estimatedEffort: 1,
        estimatedTokens: 100,
        estimatedLOC: 5,
        estimatedFiles: 1,
        validationRequirements: ["compile"],
        rationale: ["rationale"]
    };
}

function makeTestPlan(tasks: ExecutionNode[]): EngineeringPlan {
    return {
        goal: "test-goal",
        summary: "test summary",
        intent: "create",
        confidence: 95,
        complexity: { score: 1, label: "Small" },
        risk: { api: 1, execution: 1, history: 1, architecture: 1, ownership: 1, overall: "Low" },
        phases: [
            { id: "PHASE-1", name: "Phase 1", tasks: tasks.filter(t => t.phaseId === "PHASE-1").map(t => t.id) },
            { id: "PHASE-2", name: "Phase 2", tasks: tasks.filter(t => t.phaseId === "PHASE-2").map(t => t.id) }
        ],
        tasks,
        executionGraph: {
            nodes: tasks.map(t => t.id),
            edges: []
        },
        affectedFiles: [],
        affectedSymbols: [],
        validationChecklist: [],
        missingInformation: [],
        estimatedTokens: 1000,
        estimatedLOC: 50,
        estimatedDuration: 60,
        diagnostics: { planningTimeMs: 10, graphNodes: tasks.length, graphEdges: 0, dependencyDepth: 1, affectedModules: 1, complexity: "Small", riskScore: 1 }
    };
}

// Custom mocked AgentRuntimeService to control outputs
class TestAgentRuntime extends AgentRuntimeService {
    public executeCount = 0;
    public repairCount = 0;
    public simulateTransientCount = 0;
    public simulateTransientFailures = 0;
    public simulateTimeoutCount = 0;
    public simulateTimeoutFailures = 0;
    public sessions = new Map<string, string>();

    override async execute(
        request: RuntimeRequest,
        onEvent?: (event: any) => void,
        onStream?: (event: any) => void
    ): Promise<any> {
        this.executeCount++;
        const taskId = request.task.id;
        const workspaceRoot = request.context.workspaceRoot;

        // Session ID verification
        if (request.context.sessionId) {
            this.sessions.set(request.task.type, request.context.sessionId);
        }

        // Simulating transient failures
        if (this.simulateTransientFailures > 0 && this.simulateTransientCount < this.simulateTransientFailures) {
            this.simulateTransientCount++;
            throw {
                message: "Transient execution error",
                code: "PROVIDER_TRANSIENT_ERROR",
                retryable: true
            };
        }

        // Simulating timeout failures
        if (this.simulateTimeoutFailures > 0 && this.simulateTimeoutCount < this.simulateTimeoutFailures) {
            this.simulateTimeoutCount++;
            throw {
                message: "Process execution timed out",
                retryable: true
            };
        }

        if (taskId.startsWith("repair-")) {
            this.repairCount++;
            fs.writeFileSync(path.join(workspaceRoot, "output.txt"), "repaired", "utf8");
            return {
                taskId,
                status: "Completed",
                artifacts: [{
                    id: "repair-art",
                    taskId,
                    type: "code",
                    path: "output.txt",
                    content: "repaired",
                    createdAt: new Date().toISOString(),
                    provider: "mock"
                }],
                workspaceTransactionId: "tx-repair",
                metrics: {
                    provider: "mock", capability: "modify", executionTime: 10, retries: 0,
                    artifactsProduced: 1, eventsEmitted: 1, taskCount: 1,
                    cancellationCount: 0, pauseCount: 0, resumeCount: 0
                }
            };
        }

        if (taskId === "task-1") {
            fs.writeFileSync(path.join(workspaceRoot, "output.txt"), "invalid", "utf8");
            return {
                taskId,
                status: "Completed",
                artifacts: [{
                    id: "art-1",
                    taskId,
                    type: "code",
                    path: "output.txt",
                    content: "invalid",
                    createdAt: new Date().toISOString(),
                    provider: "mock"
                }],
                workspaceTransactionId: "tx-1",
                metrics: {
                    provider: "mock", capability: "create", executionTime: 10, retries: 0,
                    artifactsProduced: 1, eventsEmitted: 1, taskCount: 1,
                    cancellationCount: 0, pauseCount: 0, resumeCount: 0
                }
            };
        }

        if (taskId === "task-2") {
            fs.writeFileSync(path.join(workspaceRoot, "output2.txt"), "valid", "utf8");
            return {
                taskId,
                status: "Completed",
                artifacts: [{
                    id: "art-2",
                    taskId,
                    type: "code",
                    path: "output2.txt",
                    content: "valid",
                    createdAt: new Date().toISOString(),
                    provider: "mock"
                }],
                workspaceTransactionId: "tx-2",
                metrics: {
                    provider: "mock", capability: "modify", executionTime: 10, retries: 0,
                    artifactsProduced: 1, eventsEmitted: 1, taskCount: 1,
                    cancellationCount: 0, pauseCount: 0, resumeCount: 0
                }
            };
        }

        // Default handler
        return {
            taskId,
            status: "Completed",
            artifacts: [],
            workspaceTransactionId: `tx-${taskId}`,
            metrics: {
                provider: "mock", capability: "create", executionTime: 5, retries: 0,
                artifactsProduced: 0, eventsEmitted: 0, taskCount: 1,
                cancellationCount: 0, pauseCount: 0, resumeCount: 0
            }
        };
    }
}

// Setup the mock validator script
function setupMockValidatorScript(workspaceRoot: string): string {
    const scriptPath = path.join(workspaceRoot, "validator.js");
    const content = `
const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'output.txt');
if (!fs.existsSync(file)) {
    process.exit(1);
}
const txt = fs.readFileSync(file, 'utf8');
if (txt === 'valid' || txt === 'repaired') {
    process.exit(0);
}
process.exit(1);
`;
    fs.writeFileSync(scriptPath, content, "utf8");
    return `node "${scriptPath}"`;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function test01_PlanExecutionAndPhaseOrdering(): Promise<void> {
    console.log("\n── 01. Plan Execution & Phase Ordering ───────────────────────");
    const workspaceRoot = makeTempDir();
    const command = setupMockValidatorScript(workspaceRoot);

    try {
        const task1 = makeNode("task-1", "PHASE-1", "create");
        const plan = makeTestPlan([task1]);

        const runtime = new TestAgentRuntime(workspaceRoot);
        // Force the execution to write 'valid' directly so validation passes instantly
        const originalExecute = runtime.execute;
        runtime.execute = async (req, ev, str) => {
            if (req.task.id === "task-1") {
                fs.writeFileSync(path.join(workspaceRoot, "output.txt"), "valid", "utf8");
            }
            return originalExecute.call(runtime, req, ev, str);
        };

        const service = new AutonomousRuntimeService({
            plan,
            projectRoot: workspaceRoot,
            workspaceRoot,
            validators: [{ type: "custom", command }],
            maxRetries: 1,
            maxRepairs: 1
        }, { runtimeService: runtime });

        const result = await service.execute();
        assert(result.status === "Completed", "Autonomous execution finishes with Completed status");
        assert(result.summary.completedTasks === 1, "Completed task count matches plan");
        assert(result.summary.failedTasks === 0, "No failed tasks");
        assert(result.journal.some(e => e.type === "PhaseStarted" && e.payload.phase === "executing"), "Journal recorded executing phase start");
        assert(result.journal.some(e => e.type === "PhaseCompleted" && e.payload.phase === "executing"), "Journal recorded executing phase complete");
    } finally {
        cleanup(workspaceRoot);
    }
}

async function test02_ValidationAndRepairLoop(): Promise<void> {
    console.log("\n── 02. Validation Failures and Repair Loop ───────────────────");
    const workspaceRoot = makeTempDir();
    const command = setupMockValidatorScript(workspaceRoot);

    try {
        const task1 = makeNode("task-1", "PHASE-1", "create");
        const plan = makeTestPlan([task1]);

        const runtime = new TestAgentRuntime(workspaceRoot);
        const service = new AutonomousRuntimeService({
            plan,
            projectRoot: workspaceRoot,
            workspaceRoot,
            validators: [{ type: "custom", command }],
            maxRetries: 1,
            maxRepairs: 2
        }, { runtimeService: runtime });

        const result = await service.execute();
        assert(result.status === "Completed", "Repaired execution completed successfully");
        assert(result.summary.repairedCount === 1, "Metrics recorded 1 repair");
        assert(runtime.repairCount === 1, "Subclass AgentRuntime executed repair request exactly once");
        assert(result.errors.length === 1, "1 failure (validation failure) recorded in results errors list");
        assert(result.errors[0].category === "Transient" || result.errors[0].category === "Permanent" || result.errors[0].category === "Test", "Failure classified appropriately");
    } finally {
        cleanup(workspaceRoot);
    }
}

async function test03_RetryLoopOnTransientError(): Promise<void> {
    console.log("\n── 03. Transient Error Retries ───────────────────────────────");
    const workspaceRoot = makeTempDir();
    const command = setupMockValidatorScript(workspaceRoot);

    try {
        const task1 = makeNode("task-1", "PHASE-1", "create");
        const plan = makeTestPlan([task1]);

        const runtime = new TestAgentRuntime(workspaceRoot);
        runtime.simulateTransientFailures = 2; // Fail twice, succeed on third

        // Force direct valid write so it doesn't fail validator later
        const originalExecute = runtime.execute;
        runtime.execute = async (req, ev, str) => {
            if (req.task.id === "task-1" && runtime.simulateTransientCount >= 2) {
                fs.writeFileSync(path.join(workspaceRoot, "output.txt"), "valid", "utf8");
            }
            return originalExecute.call(runtime, req, ev, str);
        };

        const service = new AutonomousRuntimeService({
            plan,
            projectRoot: workspaceRoot,
            workspaceRoot,
            validators: [{ type: "custom", command }],
            maxRetries: 3,
            retryBackoffMs: 10
        }, { runtimeService: runtime });

        const result = await service.execute();
        assert(result.status === "Completed", "Task completed after retrying transient failures");
        assert(result.summary.retriedCount === 2, "Metrics reports 2 retries");
    } finally {
        cleanup(workspaceRoot);
    }
}

async function test04_ExecutionTimeoutAndRetry(): Promise<void> {
    console.log("\n── 04. Execution Timeout Retries ─────────────────────────────");
    const workspaceRoot = makeTempDir();
    const command = setupMockValidatorScript(workspaceRoot);

    try {
        const task1 = makeNode("task-1", "PHASE-1", "create");
        const plan = makeTestPlan([task1]);

        const runtime = new TestAgentRuntime(workspaceRoot);
        runtime.simulateTimeoutFailures = 1; // Timeout once, succeed on second

        const originalExecute = runtime.execute;
        runtime.execute = async (req, ev, str) => {
            if (req.task.id === "task-1" && runtime.simulateTimeoutCount >= 1) {
                fs.writeFileSync(path.join(workspaceRoot, "output.txt"), "valid", "utf8");
            }
            return originalExecute.call(runtime, req, ev, str);
        };

        const service = new AutonomousRuntimeService({
            plan,
            projectRoot: workspaceRoot,
            workspaceRoot,
            validators: [{ type: "custom", command }],
            maxRetries: 2,
            retryBackoffMs: 10
        }, { runtimeService: runtime });

        const result = await service.execute();
        assert(result.status === "Completed", "Task completed after retrying timeout");
        assert(result.summary.retriedCount === 1, "Metrics reports 1 retry");
    } finally {
        cleanup(workspaceRoot);
    }
}

async function test05_CheckpointingAndInterruptedRecovery(): Promise<void> {
    console.log("\n── 05. Checkpointing and Interruption Recovery ──────────────");
    const workspaceRoot = makeTempDir();

    try {
        const task1 = makeNode("task-1", "PHASE-1", "create");
        const task2 = makeNode("task-2", "PHASE-1", "modify", ["task-1"]);
        const plan = makeTestPlan([task1, task2]);

        const runtime = new TestAgentRuntime(workspaceRoot);

        // First run: trigger failure/abort after task-1 completes by throwing in task-2
        const originalExecute = runtime.execute;
        runtime.execute = async (req, ev, str) => {
            if (req.task.id === "task-2") {
                throw new Error("Simulated sudden interruption/crash");
            }
            return originalExecute.call(runtime, req, ev, str);
        };

        const service1 = new AutonomousRuntimeService({
            plan,
            projectRoot: workspaceRoot,
            workspaceRoot,
            maxRetries: 0,
            maxRepairs: 0
        }, { runtimeService: runtime });

        const result1 = await service1.execute();
        assert(result1.status === "Failed", "First loop execution failed on task-2");

        // Verify checkpoint exists for recovery
        const checkpointService = new ExecutionCheckpointService(workspaceRoot, "test-goal");
        const cp = checkpointService.load();
        assert(cp !== null, "Checkpoint saved successfully");
        assert(cp!.completedTasks.includes("task-1"), "Checkpoint records task-1 as completed");
        assert(!cp!.completedTasks.includes("task-2"), "Checkpoint does not record task-2 as completed");

        // Second run: recover and run task-2 successfully
        const runtime2 = new TestAgentRuntime(workspaceRoot);
        runtime2.executeCount = 0;

        const service2 = new AutonomousRuntimeService({
            plan,
            projectRoot: workspaceRoot,
            workspaceRoot,
            maxRetries: 0,
            maxRepairs: 0
        }, { runtimeService: runtime2 });

        const result2 = await service2.execute();
        assert(result2.status === "Completed", "Recovered execution successfully completed");
        assert(result2.summary.completedTasks === 2, "Both tasks are recorded completed in final summary");
        // task-1 is recovered, so runtime2.execute is only called for task-2
        assert(runtime2.executeCount === 1, "Recovered run skipped executing completed task-1");
    } finally {
        cleanup(workspaceRoot);
    }
}

async function test06_JournalReplayAndMetrics(): Promise<void> {
    console.log("\n── 06. Journal Replay & Metrics Correctness ──────────────────");
    const workspaceRoot = makeTempDir();
    const command = setupMockValidatorScript(workspaceRoot);

    try {
        const task1 = makeNode("task-1", "PHASE-1", "create");
        const plan = makeTestPlan([task1]);

        const runtime = new TestAgentRuntime(workspaceRoot);
        const service = new AutonomousRuntimeService({
            plan,
            projectRoot: workspaceRoot,
            workspaceRoot,
            validators: [{ type: "custom", command }],
            maxRetries: 1,
            maxRepairs: 2
        }, { runtimeService: runtime });

        const result = await service.execute();
        assert(result.status === "Completed", "Execution completed");

        // Check metrics properties
        assert(result.metrics.durationMs >= 0, "durationMs is a valid number");
        assert(result.metrics.repairCount === 1, "repairCount metric is 1");
        assert(result.metrics.validationCount === 2, "validationCount metric matches executions");
        assert(result.metrics.providerExecutions === 2, "providerExecutions count is correct (task execution + repair task)");
        assert(result.metrics.workspaceTransactions === 2, "workspaceTransactions count matches applied transaction count");
        assert(result.metrics.successRate === 100, "successRate is 100%");

        // Journal replay validation
        const journalService = new ExecutionJournalService(workspaceRoot, "test-goal");
        const events = journalService.read();
        assert(events.length > 0, "Journal contains logged events");
        assert(events[0].type === "PhaseStarted" && events[0].payload.phase === "loading", "First event is loading phase start");
        assert(events.some(e => e.type === "ValidationFailed"), "ValidationFailed event found in log replay");
        assert(events.some(e => e.type === "RepairStarted"), "RepairStarted event found in log replay");
        assert(events.some(e => e.type === "TaskCompleted"), "TaskCompleted event found in log replay");
        assert(events[events.length - 1].type === "ExecutionCompleted", "Last event is ExecutionCompleted");
    } finally {
        cleanup(workspaceRoot);
    }
}

async function test07_ParallelSafeExecution(): Promise<void> {
    console.log("\n── 07. Parallel-Safe Execution ───────────────────────────────");
    const workspaceRoot = makeTempDir();

    try {
        // Create 2 independent tasks in PHASE-1 (parallel batch)
        const task1 = makeNode("task-1", "PHASE-1", "create");
        const task2 = makeNode("task-2", "PHASE-1", "create");
        const plan = makeTestPlan([task1, task2]);

        const startTimes: Record<string, number> = {};
        const runtime = new TestAgentRuntime(workspaceRoot);
        runtime.execute = async (req) => {
            const taskId = req.task.id;
            startTimes[taskId] = Date.now();
            if (req.task.file) {
                fs.writeFileSync(path.join(workspaceRoot, req.task.file), "valid", "utf8");
            }
            await new Promise(resolve => setTimeout(resolve, 50)); // Hold briefly to force overlap
            return {
                taskId,
                status: "Completed",
                artifacts: [],
                workspaceTransactionId: `tx-${taskId}`,
                metrics: {
                    provider: "mock", capability: "create", executionTime: 50, retries: 0,
                    artifactsProduced: 0, eventsEmitted: 0, taskCount: 1,
                    cancellationCount: 0, pauseCount: 0, resumeCount: 0
                }
            };
        };

        const service = new AutonomousRuntimeService({
            plan,
            projectRoot: workspaceRoot,
            workspaceRoot,
            maxRetries: 0,
            maxRepairs: 0
        }, { runtimeService: runtime });

        const result = await service.execute();
        assert(result.status === "Completed", "Parallel plan completed");

        const t1Start = startTimes["task-1"];
        const t2Start = startTimes["task-2"];
        assert(t1Start !== undefined && t2Start !== undefined, "Both tasks executed");

        // Verify tasks started in parallel (overlap within a narrow window)
        const timeDiff = Math.abs(t1Start - t2Start);
        assert(timeDiff < 40, `Tasks ran in parallel (start time diff is ${timeDiff}ms)`);
    } finally {
        cleanup(workspaceRoot);
    }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log("===============================================================");
    console.log(" BUILD-051 — Autonomous Execution Loop Verification Suite");
    console.log("===============================================================");

    try {
        await test01_PlanExecutionAndPhaseOrdering();
        await test02_ValidationAndRepairLoop();
        await test03_RetryLoopOnTransientError();
        await test04_ExecutionTimeoutAndRetry();
        await test05_CheckpointingAndInterruptedRecovery();
        await test06_JournalReplayAndMetrics();
        await test07_ParallelSafeExecution();
    } catch (e: any) {
        console.error("Test execution interrupted by uncaught error:", e);
        failed++;
    }

    console.log("\n===============================================================");
    console.log(` RESULTS: ${passed} passed, ${failed} failed`);
    console.log("===============================================================");

    if (failed > 0) {
        process.exit(1);
    }
}

main();
