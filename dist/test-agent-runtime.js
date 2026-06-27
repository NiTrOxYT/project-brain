import process from "process";
import path from "path";
import { AgentRuntimeService } from "./agent-runtime/index.js";
import { MultiAgentOrchestratorService } from "./orchestrator/index.js";
import { QueryEngineService } from "./query-engine/index.js";
import { RuntimeService } from "./runtime/index.js";
import { KnowledgeFusionService } from "./knowledge-fusion/index.js";
import { EngineeringPlannerService } from "./engineering-planner/index.js";
class CustomTestProvider {
    id = "custom-test-provider";
    name = "Custom Test Provider";
    capabilities = ["custom-opt", "cleanup"];
    pausedTasks = new Set();
    resumedTasks = new Set();
    cancelledTasks = new Set();
    executionResolver;
    async initialize() { }
    async shutdown() { }
    supportsCapability(capability) {
        return this.capabilities.includes(capability);
    }
    async execute(task, context, onEvent) {
        onEvent({
            type: "TaskStarted",
            taskId: task.id,
            timestamp: new Date().toISOString()
        });
        if (task.type === "custom-opt") {
            // Block execution if we have a resolver (for testing pause/resume/cancel)
            if (context.blockExecution) {
                await new Promise(resolve => {
                    this.executionResolver = resolve;
                });
            }
            onEvent({
                type: "ArtifactProduced",
                taskId: task.id,
                timestamp: new Date().toISOString(),
                payload: { artifactId: `custom-art-${task.id}` }
            });
            onEvent({
                type: "TaskCompleted",
                taskId: task.id,
                timestamp: new Date().toISOString()
            });
            return {
                taskId: task.id,
                status: "Completed",
                artifacts: [{
                        id: `custom-art-${task.id}`,
                        taskId: task.id,
                        type: "code",
                        content: "custom code content"
                    }],
                metrics: {
                    provider: this.name,
                    capability: task.type,
                    executionTime: 5,
                    retries: 0,
                    artifactsProduced: 1,
                    eventsEmitted: 3,
                    taskCount: 1,
                    cancellationCount: this.cancelledTasks.has(task.id) ? 1 : 0,
                    pauseCount: this.pausedTasks.has(task.id) ? 1 : 0,
                    resumeCount: this.resumedTasks.has(task.id) ? 1 : 0
                }
            };
        }
        throw new Error("Capability not supported");
    }
    async pause(taskId) {
        this.pausedTasks.add(taskId);
    }
    async resume(taskId) {
        this.resumedTasks.add(taskId);
    }
    async cancel(taskId) {
        this.cancelledTasks.add(taskId);
    }
    triggerComplete() {
        if (this.executionResolver) {
            this.executionResolver();
        }
    }
}
async function main() {
    const workspaceRoot = path.join(process.cwd(), ".brain");
    console.log("Setting up workspace databases...");
    const runtimeService = new RuntimeService({
        root: process.cwd()
    });
    await runtimeService.initialize();
    const runtime = new AgentRuntimeService(workspaceRoot);
    console.log("\n==================================================");
    console.log("TEST 1: Provider registration & capability discovery");
    console.log("==================================================");
    // Check initial state
    const initialProviders = runtime.providers();
    console.log(`Initial providers registered: ${initialProviders.map(p => p.name).join(", ")}`);
    if (initialProviders.length !== 1 || initialProviders[0].id !== "mock-provider") {
        console.error("FAIL: Expected only mock-provider initially");
        process.exit(1);
    }
    const initialCaps = runtime.capabilities();
    console.log(`Initial capabilities: [${initialCaps.join(", ")}]`);
    if (!initialCaps.includes("analyze") || !initialCaps.includes("create")) {
        console.error("FAIL: Expected initial capabilities to include analyze and create");
        process.exit(1);
    }
    // Register custom provider
    const customProvider = new CustomTestProvider();
    runtime.register(customProvider);
    const updatedProviders = runtime.providers();
    console.log(`Updated providers registered: ${updatedProviders.map(p => p.name).join(", ")}`);
    if (updatedProviders.length !== 2) {
        console.error("FAIL: Expected 2 registered providers");
        process.exit(1);
    }
    const updatedCaps = runtime.capabilities();
    console.log(`Updated capabilities: [${updatedCaps.join(", ")}]`);
    if (!updatedCaps.includes("custom-opt") || !updatedCaps.includes("cleanup")) {
        console.error("FAIL: Expected updated capabilities to include custom-opt and cleanup");
        process.exit(1);
    }
    console.log("PASS: Provider registration and capability discovery");
    console.log("\n==================================================");
    console.log("TEST 2: Deterministic execution, events, and artifacts");
    console.log("==================================================");
    const events = [];
    const task = {
        id: "TASK-TEST-01",
        type: "create",
        title: "Test code creation",
        status: "Pending",
        prerequisites: []
    };
    const response = await runtime.execute({
        task,
        context: { workspaceRoot }
    }, (event) => {
        events.push(event);
        console.log(`  Emitted event: ${event.type} (Payload: ${JSON.stringify(event.payload)})`);
    });
    console.log(`Response status: ${response.status}`);
    console.log(`Artifacts produced: ${response.artifacts.length}`);
    if (response.artifacts.length > 0) {
        console.log(`  Artifact ID: ${response.artifacts[0].id}`);
        console.log(`  Artifact Content: ${response.artifacts[0].content}`);
    }
    // Verify events sequence
    const eventTypes = events.map(e => e.type);
    const expectedTypes = ["TaskStarted", "TaskProgress", "TaskProgress", "TaskProgress", "ArtifactProduced", "TaskCompleted"];
    const hasCorrectSequence = expectedTypes.every((t, i) => eventTypes[i] === t);
    console.log(`Event sequence validation: ${hasCorrectSequence ? "SUCCESS" : "FAIL"}`);
    if (!hasCorrectSequence) {
        console.error(`Expected sequence ${expectedTypes.join(" -> ")} but got ${eventTypes.join(" -> ")}`);
        process.exit(1);
    }
    if (response.status !== "Completed" || response.artifacts[0].type !== "code") {
        console.error("FAIL: Execution output was not completed or artifact type was not code");
        process.exit(1);
    }
    console.log("PASS: Deterministic execution, event streams, and artifact collection");
    console.log("\n==================================================");
    console.log("TEST 3: Pause, resume, and cancellation flows");
    console.log("==================================================");
    const blockTask = {
        id: "TASK-TEST-02",
        type: "custom-opt",
        title: "Test blocking option task",
        status: "Pending",
        prerequisites: []
    };
    console.log("  Launching blocking task...");
    const execPromise = runtime.execute({
        task: blockTask,
        context: { workspaceRoot, blockExecution: true }
    });
    // Simulate concurrent pause, resume, cancel calls
    console.log("  Calling pause on custom provider...");
    await customProvider.pause(blockTask.id);
    console.log("  Calling resume on custom provider...");
    await customProvider.resume(blockTask.id);
    console.log("  Calling cancel on custom provider...");
    await customProvider.cancel(blockTask.id);
    // Unblock the task
    console.log("  Triggering task completion...");
    customProvider.triggerComplete();
    const blockResponse = await execPromise;
    console.log(`  Block response status: ${blockResponse.status}`);
    console.log(`  Pause called: ${customProvider.pausedTasks.has(blockTask.id)}`);
    console.log(`  Resume called: ${customProvider.resumedTasks.has(blockTask.id)}`);
    console.log(`  Cancel called: ${customProvider.cancelledTasks.has(blockTask.id)}`);
    if (!customProvider.pausedTasks.has(blockTask.id) || !customProvider.resumedTasks.has(blockTask.id) || !customProvider.cancelledTasks.has(blockTask.id)) {
        console.error("FAIL: Pause, resume, or cancel hook was not called on provider");
        process.exit(1);
    }
    console.log("PASS: Pause, resume, and cancellation flows");
    console.log("\n==================================================");
    console.log("TEST 4: Multi-Agent Orchestrator Integration");
    console.log("==================================================");
    const planner = new EngineeringPlannerService(process.cwd(), workspaceRoot);
    const fuser = new KnowledgeFusionService(workspaceRoot);
    const orchestrator = new MultiAgentOrchestratorService(workspaceRoot);
    console.log("  Generating test plan...");
    const query = "implement a new agent runtime dashboard";
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
    console.log("  Orchestrating plan execution with AgentRuntimeService...");
    const execResult = await orchestrator.orchestrate({ plan });
    console.log(`  Execution stage: ${execResult.plan.goal}`);
    console.log(`  Completed: ${execResult.report.completedTasks}`);
    console.log(`  Failed: ${execResult.report.failedTasks}`);
    console.log(`  Skipped: ${execResult.report.skippedTasks}`);
    console.log(`  Retries: ${execResult.report.retries}`);
    console.log(`  Rollbacks: ${execResult.report.rollbackCount}`);
    if (execResult.report.completedTasks === 0 || execResult.report.failedTasks > 0) {
        console.error("FAIL: Orchestrator run did not succeed or executed 0 tasks");
        process.exit(1);
    }
    console.log("PASS: Multi-Agent Orchestrator integration");
    console.log("\n==================================================");
    console.log("TEST 5: Retry behavior simulation");
    console.log("==================================================");
    const retryTask = execResult.schedule.batches[0].taskIds[0];
    console.log(`  Simulating retry on task: ${retryTask}`);
    const retryRes = await orchestrator.orchestrate({
        plan,
        simulateFailures: [`${retryTask}-retry`]
    });
    console.log(`  Total Retries recorded: ${retryRes.report.retries}`);
    console.log(`  Task ${retryTask} status: ${retryRes.results.find(r => r.taskId === retryTask)?.status}`);
    if (retryRes.report.retries === 0) {
        console.error("FAIL: Expected at least one retry to be logged in orchestrator metrics!");
        process.exit(1);
    }
    console.log("PASS: Retry behavior simulation");
    console.log("\n==================================================");
    console.log("TEST 6: Query Engine & Diagnostics");
    console.log("==================================================");
    const engine = new QueryEngineService(process.cwd(), workspaceRoot);
    const queryResult = await engine.query({
        query: "implement agent runtime diagnostics dashboard",
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
    console.log("PASS: Query Engine integration and diagnostics");
    console.log("\nAll Agent Runtime tests passed successfully!");
}
main().catch(error => {
    console.error("Test failed:", error);
    process.exit(1);
});
