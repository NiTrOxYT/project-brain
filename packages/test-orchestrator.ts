import process from "process";
import path from "path";

import { RuntimeService } from "./runtime";
import { EngineeringPlannerService } from "./engineering-planner";
import { MultiAgentOrchestratorService } from "./orchestrator";
import { QueryEngineService } from "./query-engine";
import { KnowledgeFusionService } from "./knowledge-fusion";

async function main() {
    const workspaceRoot = path.join(process.cwd(), ".brain");

    console.log("Setting up workspace database...");
    const runtime = new RuntimeService({
        root: process.cwd()
    });
    await runtime.initialize();

    const planner = new EngineeringPlannerService(process.cwd(), workspaceRoot);
    const fuser = new KnowledgeFusionService(workspaceRoot);
    const orchestrator = new MultiAgentOrchestratorService(workspaceRoot);

    // 1. Generate plan for testing
    console.log("\n1. Generating plan for testing orchestrator...");
    const query = "implement a new execution graph exporter service";
    const candidatesResult = await fuser.fuse({
        query,
        options: {
            includeExecution: true,
            includeRelationships: true,
            includeGraph: true,
            includeArchitectureMemory: true
        }
    });

    const plan = await planner.plan({
        query,
        intent: "feature",
        candidates: candidatesResult.candidates
    });

    console.log(`  Plan generated. Goal: ${plan.goal}`);
    console.log(`  Tasks in plan: ${plan.tasks.length}`);

    // 2. Verify deterministic scheduling and topological sort
    console.log("\n2. Verifying deterministic scheduling...");
    const res1 = await orchestrator.orchestrate({ plan });
    const res2 = await orchestrator.orchestrate({ plan });

    const isScheduleIdentical = JSON.stringify(res1.schedule) === JSON.stringify(res2.schedule);
    console.log(`  Are schedules identical across runs: ${isScheduleIdentical}`);
    if (!isScheduleIdentical) {
        console.error("FAIL: Scheduling is not deterministic!");
        process.exit(1);
    }

    console.log("  Scheduled Batches:");
    for (const batch of res1.schedule.batches) {
        console.log(`    Batch ${batch.batchIndex} (${batch.phaseId}): [${batch.taskIds.join(", ")}]`);
    }

    // Verify topological constraint: prerequisites must be in earlier batches
    console.log("\n3. Verifying topological constraints...");
    const taskToBatchIndex = new Map<string, number>();
    for (const batch of res1.schedule.batches) {
        for (const tId of batch.taskIds) {
            taskToBatchIndex.set(tId, batch.batchIndex);
        }
    }

    let topoSuccess = true;
    for (const task of plan.tasks) {
        if (task.isRollback) continue;
        const taskBatchIdx = taskToBatchIndex.get(task.id)!;
        for (const pre of task.prerequisites) {
            const preBatchIdx = taskToBatchIndex.get(pre);
            if (preBatchIdx !== undefined && preBatchIdx >= taskBatchIdx) {
                console.error(`  Topological violation: task ${task.id} (batch ${taskBatchIdx}) runs before prerequisite ${pre} (batch ${preBatchIdx})!`);
                topoSuccess = false;
            }
        }
    }
    console.log(`  Topological ordering verification: ${topoSuccess ? "SUCCESS" : "FAIL"}`);
    if (!topoSuccess) process.exit(1);

    // 4. Verify parallel batches (no write conflicts)
    console.log("\n4. Verifying no write conflicts in parallel batches...");
    let writeSuccess = true;
    for (const batch of res1.schedule.batches) {
        const batchWriteFiles = new Set<string>();
        for (const tId of batch.taskIds) {
            const task = plan.tasks.find(t => t.id === tId)!;
            if (task.file && ["create", "modify", "refactor", "delete"].includes(task.type)) {
                if (batchWriteFiles.has(task.file)) {
                    console.error(`  Write conflict violation: parallel modifications on same file ${task.file} in batch ${batch.batchIndex}!`);
                    writeSuccess = false;
                }
                batchWriteFiles.add(task.file);
            }
        }
    }
    console.log(`  Write conflict verification: ${writeSuccess ? "SUCCESS" : "FAIL"}`);
    if (!writeSuccess) process.exit(1);

    // 5. Verify successful simulation execute
    console.log("\n5. Verifying successful execution run...");
    console.log(`  Execution stage: ${res1.plan.goal}`);
    console.log(`    Total tasks executed: ${res1.report.totalTasks}`);
    console.log(`    Completed: ${res1.report.completedTasks}`);
    console.log(`    Failed: ${res1.report.failedTasks}`);
    console.log(`    Skipped: ${res1.report.skippedTasks}`);
    console.log(`    Retries: ${res1.report.retries}`);
    console.log(`    Rollbacks: ${res1.report.rollbackCount}`);

    if (res1.report.completedTasks === 0 || res1.report.failedTasks > 0) {
        console.error("FAIL: Expected clean execution run to succeed!");
        process.exit(1);
    }

    // 6. Verify retry behavior
    console.log("\n6. Verifying retry behavior...");
    const retryTask = res1.schedule.batches[0].taskIds[0]; // pick first analyze task
    console.log(`  Simulating retry on task: ${retryTask}`);
    const retryRes = await orchestrator.orchestrate({
        plan,
        simulateFailures: [`${retryTask}-retry`]
    });

    console.log(`    Total Retries recorded: ${retryRes.report.retries}`);
    console.log(`    Task ${retryTask} status: ${retryRes.results.find(r => r.taskId === retryTask)?.status}`);
    
    if (retryRes.report.retries === 0) {
        console.error("FAIL: Expected at least one retry to be logged!");
        process.exit(1);
    }

    // 7. Verify failure propagation and rollback scheduling
    console.log("\n7. Verifying failure propagation and rollbacks...");
    const failTask = res1.schedule.batches[0].taskIds[0]; // fail the same first task
    console.log(`  Simulating permanent failure on task: ${failTask}`);
    const failRes = await orchestrator.orchestrate({
        plan,
        simulateFailures: [`${failTask}-fail`]
    });

    const failedTaskResult = failRes.results.find(r => r.taskId === failTask);
    console.log(`    Task ${failTask} status (Expected: failed): ${failedTaskResult?.status}`);
    console.log(`    Completed: ${failRes.report.completedTasks}`);
    console.log(`    Skipped: ${failRes.report.skippedTasks}`);
    console.log(`    Rollbacks: ${failRes.report.rollbackCount}`);

    if (failRes.report.skippedTasks === 0) {
        console.error("FAIL: Expected downstream tasks to be skipped on prerequisite failure!");
        process.exit(1);
    }

    // 8. Query Engine and Context embedding
    console.log("\n8. Verifying Query Engine and Context Assembler integration...");
    const engine = new QueryEngineService(process.cwd(), workspaceRoot);
    const queryResult = await engine.query({
        query: "implement dynamic execution graph exporter",
        includeExecution: true,
        includeRelationships: true,
        includeGraph: true,
        useCache: false
    });

    console.log(`  Query intent: ${queryResult.context.plan.intent}`);
    console.log(`  Has executionSchedule: ${!!queryResult.context.executionSchedule}`);
    console.log(`  Has executionDiagnostics: ${!!queryResult.context.executionDiagnostics}`);

    if (!queryResult.context.executionSchedule || !queryResult.context.executionDiagnostics) {
        console.error("FAIL: ContextPackage did not contain execution schedule or diagnostics!");
        process.exit(1);
    }

    console.log(`    Schedule Batches count: ${queryResult.context.executionSchedule.batches.length}`);
    console.log(`    Diagnostics Total Tasks: ${queryResult.context.executionDiagnostics.totalTasks}`);

    console.log("\nAll orchestrator tests passed successfully!");
}

main().catch(error => {
    console.error("Test failed:", error);
    process.exit(1);
});
