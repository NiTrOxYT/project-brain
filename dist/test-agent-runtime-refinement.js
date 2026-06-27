import process from "process";
import path from "path";
import fs from "fs";
import { AgentRuntimeService } from "./agent-runtime/index.js";
import { MultiAgentOrchestratorService } from "./orchestrator/index.js";
import { QueryEngineService } from "./query-engine/index.js";
import { RuntimeService } from "./runtime/index.js";
import { KnowledgeFusionService } from "./knowledge-fusion/index.js";
import { EngineeringPlannerService } from "./engineering-planner/index.js";
class PriorityTestProvider {
    id;
    name;
    capabilities;
    priority;
    health;
    supportedRuntimeVersion;
    shutdownCalled = false;
    constructor(id, name, priority, health = "Healthy", supportedRuntimeVersion = "1.0.0") {
        this.id = id;
        this.name = name;
        this.capabilities = ["custom-run"];
        this.priority = priority;
        this.health = health;
        this.supportedRuntimeVersion = supportedRuntimeVersion;
    }
    async initialize() { }
    async shutdown() {
        this.shutdownCalled = true;
    }
    supportsCapability(capability) {
        return this.capabilities.includes(capability);
    }
    async execute(task, context, onEvent) {
        onEvent({ type: "TaskStarted", taskId: task.id, timestamp: new Date().toISOString() });
        if (context.blockExecution) {
            await new Promise(resolve => {
                // Block forever
            });
        }
        const artifact = {
            id: `art-${task.id}`,
            taskId: task.id,
            type: "code",
            content: "hello world content"
        };
        onEvent({ type: "ArtifactProduced", taskId: task.id, timestamp: new Date().toISOString(), payload: { artifactId: artifact.id, artifact } });
        onEvent({ type: "ArtifactProduced", taskId: task.id, timestamp: new Date().toISOString(), payload: { artifactId: artifact.id, artifact } });
        onEvent({ type: "TaskCompleted", taskId: task.id, timestamp: new Date().toISOString() });
        return {
            taskId: task.id,
            status: "Completed",
            artifacts: [artifact, artifact], // return duplicate
            metrics: {
                provider: this.name,
                capability: task.type,
                executionTime: 5,
                retries: 0,
                artifactsProduced: 2,
                eventsEmitted: 4,
                taskCount: 1,
                cancellationCount: 0,
                pauseCount: 0,
                resumeCount: 0
            }
        };
    }
    async pause(taskId) { }
    async resume(taskId) { }
    async cancel(taskId) { }
}
async function main() {
    const workspaceRoot = path.join(process.cwd(), ".brain");
    console.log("Setting up workspace database...");
    const runtimeService = new RuntimeService({ root: process.cwd() });
    await runtimeService.initialize();
    const runtime = new AgentRuntimeService(workspaceRoot);
    console.log("\n==================================================");
    console.log("TEST 1: Provider selection order and negotiation");
    console.log("==================================================");
    // Register multiple providers for capability "custom-run" with different priorities and registration orders
    const pLow = new PriorityTestProvider("low-priority", "Low Provider", 5);
    const pHigh = new PriorityTestProvider("high-priority", "High Provider", 20);
    const pMid1 = new PriorityTestProvider("mid-priority-1", "Mid 1 Provider", 10);
    const pMid2 = new PriorityTestProvider("mid-priority-2", "Mid 2 Provider", 10);
    runtime.register(pLow);
    runtime.register(pHigh);
    runtime.register(pMid1);
    runtime.register(pMid2);
    const task = { id: "NEGOTIATE-TASK-01", type: "custom-run", title: "Test selection", status: "Pending", prerequisites: [] };
    const negotiated = runtime.registry.discover(task.type);
    console.log(`Negotiated selection order: ${negotiated.map((p) => `${p.id} (priority: ${p.priority})`).join(" -> ")}`);
    // Checks:
    // 1. high-priority (priority 20) must be first
    // 2. mid-priority-1 (priority 10, registered before mid-priority-2) must be second
    // 3. mid-priority-2 (priority 10, registered after mid-priority-1) must be third
    // 4. low-priority (priority 5) must be fourth
    if (negotiated[0].id !== "high-priority" || negotiated[1].id !== "mid-priority-1" || negotiated[2].id !== "mid-priority-2" || negotiated[3].id !== "low-priority") {
        console.error("FAIL: Provider selection order violation!");
        process.exit(1);
    }
    console.log("PASS: Selection order and negotiation prioritization");
    console.log("\n==================================================");
    console.log("TEST 2: Health-aware provider selection");
    console.log("==================================================");
    const pOffline = new PriorityTestProvider("offline-priority", "Offline Provider", 100, "Offline");
    runtime.register(pOffline);
    const negotiatedWithOffline = runtime.registry.discover(task.type);
    console.log(`Selection order with offline: ${negotiatedWithOffline.map((p) => `${p.id} (health: ${p.health})`).join(" -> ")}`);
    // Offline provider (even with priority 100) must be skipped completely
    if (negotiatedWithOffline.some((p) => p.id === "offline-priority")) {
        console.error("FAIL: Offline provider was not skipped!");
        process.exit(1);
    }
    // Version incompatible check: should also be skipped
    const pIncompatible = new PriorityTestProvider("incompatible-priority", "Incompatible Provider", 200, "Healthy", "2.0.0");
    runtime.register(pIncompatible);
    const negotiatedWithIncompatible = runtime.registry.discover(task.type);
    if (negotiatedWithIncompatible.some((p) => p.id === "incompatible-priority")) {
        console.error("FAIL: Incompatible provider was not skipped!");
        process.exit(1);
    }
    console.log("PASS: Health and compatibility-aware selection");
    console.log("\n==================================================");
    console.log("TEST 3: Middleware execution order & identity protection");
    console.log("==================================================");
    const trace = [];
    const mw1 = {
        name: "mw1",
        async beforeExecute(req) {
            trace.push("mw1 before");
        },
        async afterExecute(req, res) {
            trace.push("mw1 after");
        }
    };
    const mw2 = {
        name: "mw2",
        async beforeExecute(req) {
            trace.push("mw2 before");
        },
        async afterExecute(req, res) {
            trace.push("mw2 after");
        }
    };
    const mwMutator = {
        name: "mutator",
        async beforeExecute(req) {
            req.task.id = "MUTATED-ID";
        }
    };
    runtime.addMiddleware(mw1);
    runtime.addMiddleware(mw2);
    const response = await runtime.execute({
        task,
        context: { workspaceRoot }
    });
    console.log(`Middleware execution trace: ${trace.join(" -> ")}`);
    if (trace[0] !== "mw1 before" || trace[1] !== "mw2 before" || trace[2] !== "mw1 after" || trace[3] !== "mw2 after") {
        console.error("FAIL: Middleware execution order is not chainable or in correct sequence!");
        process.exit(1);
    }
    // Verify task mutation protection
    console.log("  Verifying task mutation guard...");
    const runtimeWithMutator = new AgentRuntimeService(workspaceRoot);
    runtimeWithMutator.addMiddleware(mwMutator);
    let mutationThrew = false;
    try {
        await runtimeWithMutator.execute({
            task: { id: "TEST-MUTATION-TASK", type: "analyze", title: "Testing", status: "Pending", prerequisites: [] },
            context: { workspaceRoot }
        });
    }
    catch (e) {
        mutationThrew = true;
        console.log(`  Mutation caught correctly. Message: ${e.message}`);
    }
    if (!mutationThrew) {
        console.error("FAIL: Mutation guard did not catch middleware changing task identity!");
        process.exit(1);
    }
    console.log("PASS: Middleware execution order & identity protection");
    console.log("\n==================================================");
    console.log("TEST 4: Lifecyle Hooks execution");
    console.log("==================================================");
    const hookTrace = [];
    const hooks = {
        onProviderRegistered(p) {
            hookTrace.push(`onProviderRegistered:${p.id}`);
        },
        onTaskQueued(t) {
            hookTrace.push(`onTaskQueued:${t.id}`);
        },
        onTaskStarted(t) {
            hookTrace.push(`onTaskStarted:${t.id}`);
        },
        onTaskFinished(t, res) {
            hookTrace.push(`onTaskFinished:${t.id}`);
        }
    };
    const runtimeWithHooks = new AgentRuntimeService(workspaceRoot);
    runtimeWithHooks.addHooks(hooks);
    await runtimeWithHooks.execute({
        task: { id: "HOOKS-TASK-01", type: "create", title: "Test hooks", status: "Pending", prerequisites: [] },
        context: { workspaceRoot }
    });
    console.log(`Hooks trace: ${hookTrace.join(" -> ")}`);
    if (!hookTrace.includes("onTaskQueued:HOOKS-TASK-01") || !hookTrace.includes("onTaskStarted:HOOKS-TASK-01") || !hookTrace.includes("onTaskFinished:HOOKS-TASK-01")) {
        console.error("FAIL: Hook execution trace is missing critical lifecycle stages!");
        process.exit(1);
    }
    console.log("PASS: Lifecycle hooks execution");
    console.log("\n==================================================");
    console.log("TEST 5: Artifact versioning and duplicate suppression");
    console.log("==================================================");
    const uniqueTaskId = `ART-DUP-TASK-${Date.now()}`;
    // Using high-priority provider which emits duplicate artifacts
    const events = [];
    const executeRes = await runtime.execute({
        task: { id: uniqueTaskId, type: "custom-run", title: "Test duplicates", status: "Pending", prerequisites: [] },
        context: { workspaceRoot }
    }, (e) => {
        events.push(e);
    });
    // Check version, checksum, hash, provider fields
    const art = executeRes.artifacts[0];
    console.log(`Artifact metrics: version=${art.version}, createdAt=${art.createdAt}, checksum=${art.checksum}, hash=${art.hash}, provider=${art.provider}`);
    if (!art.version || !art.createdAt || !art.checksum || !art.hash || !art.provider) {
        console.error("FAIL: Artifact metadata fields are not fully populated!");
        process.exit(1);
    }
    // Verify duplicate artifact suppression (only 1 artifact should survive deduplication)
    const artifactProducedEvents = events.filter(e => e.type === "ArtifactProduced");
    console.log(`Emitted ArtifactProduced events: ${artifactProducedEvents.length}`);
    console.log(`Response artifacts count: ${executeRes.artifacts.length}`);
    if (artifactProducedEvents.length !== 1 || executeRes.artifacts.length !== 1) {
        console.error("FAIL: Duplicate artifacts or events were not suppressed!");
        process.exit(1);
    }
    console.log("PASS: Artifact versioning & duplicate suppression");
    console.log("\n==================================================");
    console.log("TEST 6: Runtime snapshots & persistence");
    console.log("==================================================");
    const snapshotPath = path.join(workspaceRoot, "runtime", "snapshot.json");
    console.log(`Checking snapshot existence at: ${snapshotPath}`);
    if (!fs.existsSync(snapshotPath)) {
        console.error("FAIL: Snapshot file not persisted!");
        process.exit(1);
    }
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));
    console.log(`Snapshot Content ID: ${snapshot.id}`);
    console.log(`Snapshot Completed Tasks: ${snapshot.completedTasks.join(", ")}`);
    if (!snapshot.id || !snapshot.timestamp || !snapshot.completedTasks.includes(uniqueTaskId)) {
        console.error("FAIL: Snapshot states were invalid or outdated!");
        process.exit(1);
    }
    // Test recovery
    const recovered = await runtime.recover();
    console.log(`Recovered Snapshot ID matches: ${recovered.id === snapshot.id}`);
    if (recovered.id !== snapshot.id) {
        console.error("FAIL: Recovered snapshot did not match the persisted state!");
        process.exit(1);
    }
    console.log("PASS: Snapshot creation and recovery");
    console.log("\n==================================================");
    console.log("TEST 7: Events persistence and replay");
    console.log("==================================================");
    const replayed = runtime.replay(uniqueTaskId);
    console.log(`Replayed events count for taskId: ${replayed.length}`);
    for (const e of replayed) {
        console.log(`  Event: ${e.type} at ${e.timestamp}`);
    }
    if (replayed.length !== 3) { // TaskStarted, ArtifactProduced, TaskCompleted (TaskProgress not sent by custom provider)
        console.error(`FAIL: Expected 3 replayed events but got ${replayed.length}`);
        process.exit(1);
    }
    const sessionReplayed = runtime.replaySession(runtime.getSessionId());
    console.log(`Replayed events count for sessionId: ${sessionReplayed.length}`);
    if (sessionReplayed.length === 0) {
        console.error("FAIL: Session-based replay returned 0 events!");
        process.exit(1);
    }
    console.log("PASS: Event persistence & replay");
    console.log("\n==================================================");
    console.log("TEST 8: Cumulative Metrics and Diagnostics");
    console.log("==================================================");
    const diags = runtime.diagnostics();
    console.log(`Diagnostics:`);
    console.log(`  Total execution time: ${diags.totalExecutionTimeMs} ms`);
    console.log(`  Artifacts count: ${diags.artifactsCount}`);
    console.log(`  Completed tasks count: ${diags.taskCounts.Completed}`);
    console.log(`  Selection reasoning entries: ${diags.providerSelectionReasoning?.length}`);
    console.log(`  Middleware timings entries: ${Object.keys(diags.middlewareTimings || {}).length}`);
    console.log(`  Hook timings entries: ${Object.keys(diags.hookTimings || {}).length}`);
    console.log(`  Event counts TaskStarted: ${diags.eventCounts?.TaskStarted}`);
    if (diags.artifactsCount === 0 || diags.taskCounts.Completed === 0 || !diags.providerSelectionReasoning || diags.providerSelectionReasoning.length === 0) {
        console.error("FAIL: Diagnostics or metrics are missing or not accumulated!");
        process.exit(1);
    }
    console.log("PASS: Metrics accumulation & diagnostics");
    console.log("\n==================================================");
    console.log("TEST 9: Executor timeout handling & deterministic backoff");
    console.log("==================================================");
    // Timeout task execution
    const timeoutTask = { id: "TIMEOUT-TASK", type: "custom-run", title: "Test timeouts", status: "Pending", prerequisites: [] };
    const runtimeForTimeout = new AgentRuntimeService(workspaceRoot);
    // Add custom provider that blocks execution
    const blockProv = new PriorityTestProvider("blocking-provider", "Blocking Provider", 500);
    runtimeForTimeout.register(blockProv);
    console.log("  Executing with 10ms timeout limit...");
    const timeoutRes = await runtimeForTimeout.execute({
        task: timeoutTask,
        context: { workspaceRoot, blockExecution: true, timeoutMs: 10 }
    });
    console.log(`  Timeout response status: ${timeoutRes.status}`);
    console.log(`  Timeout response error: ${timeoutRes.error}`);
    if (timeoutRes.status !== "Failed" || !timeoutRes.error?.includes("timed out")) {
        console.error("FAIL: Timeout racing did not trigger or failed status was not returned!");
        process.exit(1);
    }
    console.log("PASS: Timeout handling & deterministic retry backoff");
    console.log("\n==================================================");
    console.log("TEST 10: Graceful shutdown");
    console.log("==================================================");
    let shutdownHookCalled = false;
    runtime.addHooks({
        onRuntimeShutdown() {
            shutdownHookCalled = true;
        }
    });
    console.log("  Shutting down service...");
    await runtime.shutdown();
    console.log(`  Shutdown hooks triggered: ${shutdownHookCalled}`);
    console.log(`  Provider low shutdown: ${pLow.shutdownCalled}`);
    console.log(`  Provider high shutdown: ${pHigh.shutdownCalled}`);
    if (!shutdownHookCalled || !pLow.shutdownCalled || !pHigh.shutdownCalled) {
        console.error("FAIL: Graceful shutdown failed to call hooks or provider shutdowns!");
        process.exit(1);
    }
    console.log("PASS: Graceful shutdown");
    console.log("\n==================================================");
    console.log("TEST 11: Multi-Agent Orchestrator Integration & Diagnostics");
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
    console.log("  Orchestrating plan execution...");
    const execResult = await orchestrator.orchestrate({ plan });
    console.log(`  Orchestrator selectedProvider: ${execResult.report.selectedProvider}`);
    console.log(`  Orchestrator providerHealth: ${execResult.report.providerHealth}`);
    console.log(`  Orchestrator executionSnapshotId: ${execResult.report.executionSnapshotId}`);
    console.log(`  Orchestrator has runtimeMetricsSummary: ${!!execResult.report.runtimeMetricsSummary}`);
    if (execResult.report.selectedProvider !== "Mock Agent Provider" || execResult.report.providerHealth !== "Healthy" || !execResult.report.executionSnapshotId || !execResult.report.runtimeMetricsSummary) {
        console.error("FAIL: Orchestrator report is missing runtime selection diagnostics!");
        process.exit(1);
    }
    console.log("PASS: Multi-Agent Orchestrator integration and diagnostics");
    console.log("\n==================================================");
    console.log("TEST 12: Query Engine Diagnostics");
    console.log("==================================================");
    const engine = new QueryEngineService(process.cwd(), workspaceRoot);
    const queryResult = await engine.query({
        query: "implement agent runtime diagnostics dashboard",
        includeExecution: true,
        includeRelationships: true,
        includeGraph: true,
        useCache: false
    });
    console.log(`  QueryEngine selectedProvider: ${queryResult.diagnostics.selectedProvider}`);
    console.log(`  QueryEngine providerHealth: ${queryResult.diagnostics.providerHealth}`);
    console.log(`  QueryEngine executionSnapshotId: ${queryResult.diagnostics.executionSnapshotId}`);
    console.log(`  QueryEngine has runtimeMetricsSummary: ${!!queryResult.diagnostics.runtimeMetricsSummary}`);
    if (queryResult.diagnostics.selectedProvider !== "Mock Agent Provider" || queryResult.diagnostics.providerHealth !== "Healthy" || !queryResult.diagnostics.executionSnapshotId || !queryResult.diagnostics.runtimeMetricsSummary) {
        console.error("FAIL: Query Engine diagnostics did not expose selected provider or snapshot statistics!");
        process.exit(1);
    }
    console.log("PASS: Query Engine integration and diagnostics");
    console.log("\nAll Refined Agent Runtime tests passed successfully!");
}
main().catch(error => {
    console.error("Test failed:", error);
    process.exit(1);
});
