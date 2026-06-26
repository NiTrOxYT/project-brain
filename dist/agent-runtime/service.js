import fs from "fs";
import path from "path";
import { AgentRegistry } from "./registry";
import { RuntimeEngine } from "./runtime";
import { RuntimeExecutor } from "./executor";
// Mock Provider Implementation
export class MockAgentProvider {
    id = "mock-provider";
    name = "Mock Agent Provider";
    capabilities = [
        "analyze",
        "create",
        "modify",
        "refactor",
        "delete",
        "validate",
        "document",
        "test",
        "cleanup"
    ];
    priority = 0;
    version = "1.0.0";
    supportedRuntimeVersion = "1.0.0";
    health = "Healthy";
    metadata = {};
    async initialize() { }
    async shutdown() { }
    supportsCapability(capability) {
        return this.capabilities.includes(capability);
    }
    async execute(task, context, onEvent) {
        // Emit deterministic start event
        onEvent({
            type: "TaskStarted",
            taskId: task.id,
            timestamp: new Date().toISOString()
        });
        // Emit deterministic progress events
        for (const progress of [25, 50, 75]) {
            onEvent({
                type: "TaskProgress",
                taskId: task.id,
                timestamp: new Date().toISOString(),
                payload: { progress }
            });
        }
        // Simulate failure if requested
        if (context.simulateFailure) {
            onEvent({
                type: "TaskFailed",
                taskId: task.id,
                timestamp: new Date().toISOString(),
                payload: { error: "Mock execution failure requested" }
            });
            return {
                taskId: task.id,
                status: "Failed",
                error: "Mock execution failure requested",
                artifacts: [],
                metrics: {
                    provider: this.name,
                    capability: task.type,
                    executionTime: 10,
                    retries: 0,
                    artifactsProduced: 0,
                    eventsEmitted: 5,
                    taskCount: 1,
                    cancellationCount: 0,
                    pauseCount: 0,
                    resumeCount: 0
                }
            };
        }
        // Map task type to artifact type
        let artifactType = "log";
        if (["create", "modify", "refactor"].includes(task.type)) {
            artifactType = "code";
        }
        else if (task.type === "test") {
            artifactType = "test";
        }
        else if (task.type === "validate") {
            artifactType = "diagnostic";
        }
        else if (task.type === "document") {
            artifactType = "documentation";
        }
        const artifact = {
            id: `artifact-${task.id}`,
            taskId: task.id,
            type: artifactType,
            path: task.file,
            content: `Mock content generated for task: ${task.id} (${task.title})`,
            version: "1.0.0",
            createdAt: new Date().toISOString(),
            provider: this.id,
            checksum: "",
            hash: ""
        };
        // Emit artifact produced event
        onEvent({
            type: "ArtifactProduced",
            taskId: task.id,
            timestamp: new Date().toISOString(),
            payload: { artifactId: artifact.id, artifact }
        });
        // Emit completed event
        onEvent({
            type: "TaskCompleted",
            taskId: task.id,
            timestamp: new Date().toISOString()
        });
        return {
            taskId: task.id,
            status: "Completed",
            artifacts: [artifact],
            metrics: {
                provider: this.name,
                capability: task.type,
                executionTime: 10,
                retries: 0,
                artifactsProduced: 1,
                eventsEmitted: 6,
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
// Runtime Service Implementation
export class AgentRuntimeService {
    workspaceRoot;
    registry = new AgentRegistry();
    engine;
    workspaceEngine;
    providerRuntime;
    middlewares = [];
    hooks = [];
    timings = {
        middleware: {},
        hook: {},
        eventCounts: {}
    };
    providerSelectionReasoning = [];
    replayStatistics = { totalReplayed: 0, lastReplayedSession: "" };
    snapshotStatistics = { totalSnapshotsWritten: 0, lastSnapshotId: "" };
    sessionId = `session-${Date.now()}`;
    // Cumulative metrics
    totalExecutionTimeMs = 0;
    taskCounts = {
        Pending: 0, Queued: 0, Running: 0, Paused: 0, Completed: 0, Failed: 0, Cancelled: 0, Retrying: 0, RolledBack: 0
    };
    totalArtifactsCount = 0;
    constructor(workspaceRoot, workspaceEngine, providerRuntime) {
        this.workspaceRoot = workspaceRoot;
        this.engine = new RuntimeEngine(this.registry);
        this.workspaceEngine = workspaceEngine;
        this.providerRuntime = providerRuntime;
        // Register default Mock provider
        this.registry.register(new MockAgentProvider());
    }
    addMiddleware(middleware) {
        this.middlewares.push(middleware);
    }
    addHooks(hooks) {
        this.hooks.push(hooks);
        // Trigger register hook synchronously
        const list = this.registry.list();
        if (hooks.onProviderRegistered) {
            for (const desc of list) {
                const prov = this.registry.get(desc.id);
                if (prov) {
                    try {
                        hooks.onProviderRegistered(prov);
                    }
                    catch (e) { }
                }
            }
        }
    }
    async execute(request, onEvent = () => { }) {
        const startExecution = Date.now();
        this.taskCounts.Queued++;
        // --- Provider Runtime delegation ---
        // If a ProviderRuntimeService is configured, delegate execution through it.
        // This enables the full provider SDK pipeline: negotiation, health, retry,
        // fallback, metrics, sessions, streaming.
        if (this.providerRuntime) {
            try {
                const response = await this.providerRuntime.execute(request, onEvent);
                const execTime = Date.now() - startExecution;
                this.totalExecutionTimeMs += execTime;
                this.totalArtifactsCount += response.artifacts.length;
                this.taskCounts[response.status === "Completed" ? "Completed" : "Failed"]++;
                return response;
            }
            catch (err) {
                this.taskCounts.Failed++;
                return {
                    taskId: request.task.id,
                    status: "Failed",
                    error: `ProviderRuntime error: ${err.message}`,
                    artifacts: [],
                    metrics: {
                        provider: "provider-runtime",
                        capability: request.task.type,
                        executionTime: Date.now() - startExecution,
                        retries: 0,
                        artifactsProduced: 0,
                        eventsEmitted: 0,
                        taskCount: 1,
                        cancellationCount: 0,
                        pauseCount: 0,
                        resumeCount: 0
                    }
                };
            }
        }
        // Evaluate and record capability negotiation provider selection reasoning
        const providers = this.registry.discover(request.task.type);
        const reasoning = `Negotiating capability: '${request.task.type}'. Candidates count: ${providers.length}. `;
        if (providers.length > 0) {
            const selected = providers[0];
            this.providerSelectionReasoning.push(reasoning + `Selected '${selected.name}' (ID: ${selected.id}) with priority ${selected.priority ?? 0}, health '${selected.health || "Healthy"}', version '${selected.version || "1.0.0"}'.`);
        }
        else {
            this.providerSelectionReasoning.push(reasoning + "No compatible healthy providers found.");
        }
        const executor = new RuntimeExecutor(this.engine, this.middlewares, this.hooks, this.timings);
        // Setup snapshot recovery tracking variables
        const runningTasks = [request.task.id];
        const completedTasks = [];
        const providerAssignments = {};
        const retryCounts = {};
        if (providers.length > 0) {
            providerAssignments[request.task.id] = providers[0].id;
        }
        // Save initial snapshot
        const snapshotId = this.saveSnapshot(runningTasks, completedTasks, providerAssignments, retryCounts);
        request.context.activeSnapshotId = snapshotId;
        const response = await executor.executeTask(request, (event) => {
            // Persist events to events.jsonl
            event.sessionId = this.sessionId;
            this.persistEvent(event);
            // Maintain metrics and snapshot states based on execution events
            if (event.type === "RetryStarted") {
                this.taskCounts.Retrying++;
                const attempt = event.payload?.attempt || 1;
                retryCounts[request.task.id] = attempt;
                this.saveSnapshot(runningTasks, completedTasks, providerAssignments, retryCounts);
            }
            onEvent(event);
        });
        // Save completed tasks snapshot update
        runningTasks.splice(runningTasks.indexOf(request.task.id), 1);
        if (response.status === "Completed") {
            completedTasks.push(request.task.id);
        }
        this.saveSnapshot(runningTasks, completedTasks, providerAssignments, retryCounts);
        // Apply artifacts to workspace if engine is configured and execution succeeded
        if (this.workspaceEngine && response.status === "Completed" && response.artifacts.length > 0) {
            try {
                const wsResult = await this.workspaceEngine.applyArtifacts(response.artifacts);
                if (wsResult.success) {
                    response.workspaceTransactionId = wsResult.transactionId;
                }
            }
            catch (wsErr) {
                // Workspace application errors are non-fatal — log only
                this.providerSelectionReasoning.push(`WorkspaceEngine apply error: ${wsErr.message}`);
            }
        }
        // Accumulate cumulative metrics
        const elapsed = Date.now() - startExecution;
        this.totalExecutionTimeMs += elapsed;
        this.totalArtifactsCount += response.artifacts.length;
        if (this.taskCounts[response.status] !== undefined) {
            this.taskCounts[response.status]++;
        }
        else {
            this.taskCounts[response.status] = 1;
        }
        return response;
    }
    register(provider) {
        this.registry.register(provider);
        // Trigger register hook synchronously
        for (const h of this.hooks) {
            if (h.onProviderRegistered) {
                try {
                    h.onProviderRegistered(provider);
                }
                catch (e) { }
            }
        }
    }
    unregister(id) {
        this.registry.unregister(id);
        // Trigger remove hook synchronously
        for (const h of this.hooks) {
            if (h.onProviderRemoved) {
                try {
                    h.onProviderRemoved(id);
                }
                catch (e) { }
            }
        }
    }
    providers() {
        return this.registry.list();
    }
    capabilities() {
        const caps = new Set();
        for (const p of this.registry.list()) {
            for (const c of p.capabilities) {
                caps.add(c);
            }
        }
        return Array.from(caps);
    }
    diagnostics() {
        return {
            totalExecutionTimeMs: this.totalExecutionTimeMs,
            taskCounts: this.taskCounts,
            artifactsCount: this.totalArtifactsCount,
            providerSelectionReasoning: this.providerSelectionReasoning,
            middlewareTimings: this.timings.middleware,
            hookTimings: this.timings.hook,
            eventCounts: this.timings.eventCounts,
            replayStatistics: this.replayStatistics,
            snapshotStatistics: this.snapshotStatistics
        };
    }
    async shutdown() {
        const list = this.registry.list();
        for (const desc of list) {
            const provider = this.registry.get(desc.id);
            if (provider) {
                try {
                    await provider.shutdown();
                }
                catch (e) { }
            }
        }
        // Trigger runtime shutdown hook synchronously
        for (const h of this.hooks) {
            if (h.onRuntimeShutdown) {
                try {
                    h.onRuntimeShutdown();
                }
                catch (e) { }
            }
        }
    }
    persistEvent(event) {
        try {
            const runtimeDir = path.join(this.workspaceRoot, "runtime");
            if (!fs.existsSync(runtimeDir)) {
                fs.mkdirSync(runtimeDir, { recursive: true });
            }
            const eventsFile = path.join(runtimeDir, "events.jsonl");
            fs.appendFileSync(eventsFile, JSON.stringify(event) + "\n");
        }
        catch (err) { }
    }
    saveSnapshot(runningTasks, completedTasks, providerAssignments, retryCounts) {
        const snapshotId = `snapshot-${Date.now()}`;
        try {
            const runtimeDir = path.join(this.workspaceRoot, "runtime");
            if (!fs.existsSync(runtimeDir)) {
                fs.mkdirSync(runtimeDir, { recursive: true });
            }
            const snapshotFile = path.join(runtimeDir, "snapshot.json");
            const snapshot = {
                id: snapshotId,
                timestamp: new Date().toISOString(),
                runningTasks,
                completedTasks,
                providerAssignments,
                retryCounts,
                timings: this.timings
            };
            fs.writeFileSync(snapshotFile, JSON.stringify(snapshot, null, 2));
            this.snapshotStatistics.totalSnapshotsWritten++;
            this.snapshotStatistics.lastSnapshotId = snapshotId;
        }
        catch (err) { }
        return snapshotId;
    }
    async recover() {
        try {
            const snapshotFile = path.join(this.workspaceRoot, "runtime", "snapshot.json");
            if (fs.existsSync(snapshotFile)) {
                return JSON.parse(fs.readFileSync(snapshotFile, "utf-8"));
            }
        }
        catch (err) { }
        return null;
    }
    replay(taskId) {
        const events = [];
        try {
            const eventsFile = path.join(this.workspaceRoot, "runtime", "events.jsonl");
            if (fs.existsSync(eventsFile)) {
                const lines = fs.readFileSync(eventsFile, "utf-8").split("\n");
                for (const line of lines) {
                    if (!line.trim())
                        continue;
                    const ev = JSON.parse(line);
                    if (ev.taskId === taskId) {
                        events.push(ev);
                    }
                }
            }
        }
        catch (err) { }
        this.replayStatistics.totalReplayed += events.length;
        return events;
    }
    replaySession(sessionId) {
        const events = [];
        try {
            const eventsFile = path.join(this.workspaceRoot, "runtime", "events.jsonl");
            if (fs.existsSync(eventsFile)) {
                const lines = fs.readFileSync(eventsFile, "utf-8").split("\n");
                for (const line of lines) {
                    if (!line.trim())
                        continue;
                    const ev = JSON.parse(line);
                    if (ev.sessionId === sessionId) {
                        events.push(ev);
                    }
                }
            }
        }
        catch (err) { }
        this.replayStatistics.totalReplayed += events.length;
        this.replayStatistics.lastReplayedSession = sessionId;
        return events;
    }
    getSessionId() {
        return this.sessionId;
    }
}
