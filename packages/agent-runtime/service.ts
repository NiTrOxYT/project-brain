import fs from "fs";
import path from "path";
import { AgentProvider } from "./provider";
import { AgentRegistry } from "./registry";
import { RuntimeEngine } from "./runtime";
import { RuntimeExecutor } from "./executor";
import {
    RuntimeRequest,
    RuntimeResponse,
    AgentDescriptor,
    AgentCapability,
    RuntimeEvent,
    RuntimeTask,
    RuntimeContext,
    RuntimeDiagnostics,
    TaskLifecycle
} from "./types";
import { RuntimeArtifact } from "./artifacts";
import { RuntimeMiddleware } from "./middleware";
import { RuntimeHooks } from "./hooks";
import { WorkspaceEngine } from "../workspace/workspace-engine";

// Mock Provider Implementation
export class MockAgentProvider implements AgentProvider {
    readonly id = "mock-provider";
    readonly name = "Mock Agent Provider";
    readonly capabilities: AgentCapability[] = [
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
    health: "Healthy" | "Degraded" | "Offline" = "Healthy";
    metadata = {};

    async initialize(): Promise<void> {}
    async shutdown(): Promise<void> {}

    supportsCapability(capability: AgentCapability): boolean {
        return this.capabilities.includes(capability);
    }

    async execute(
        task: RuntimeTask,
        context: RuntimeContext,
        onEvent: (event: RuntimeEvent) => void
    ): Promise<RuntimeResponse> {
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
        let artifactType: RuntimeArtifact["type"] = "log";
        if (["create", "modify", "refactor"].includes(task.type)) {
            artifactType = "code";
        } else if (task.type === "test") {
            artifactType = "test";
        } else if (task.type === "validate") {
            artifactType = "diagnostic";
        } else if (task.type === "document") {
            artifactType = "documentation";
        }

        const artifact: RuntimeArtifact = {
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

    async pause(taskId: string): Promise<void> {}
    async resume(taskId: string): Promise<void> {}
    async cancel(taskId: string): Promise<void> {}
}

// Runtime Service Implementation
export class AgentRuntimeService {
    private readonly registry = new AgentRegistry();
    private readonly engine: RuntimeEngine;
    private readonly workspaceEngine?: WorkspaceEngine;

    private readonly middlewares: RuntimeMiddleware[] = [];
    private readonly hooks: RuntimeHooks[] = [];
    private readonly timings = {
        middleware: {} as Record<string, number>,
        hook: {} as Record<string, number>,
        eventCounts: {} as Record<string, number>
    };
    private readonly providerSelectionReasoning: string[] = [];
    private readonly replayStatistics = { totalReplayed: 0, lastReplayedSession: "" };
    private readonly snapshotStatistics = { totalSnapshotsWritten: 0, lastSnapshotId: "" };
    private readonly sessionId = `session-${Date.now()}`;

    // Cumulative metrics
    private totalExecutionTimeMs = 0;
    private taskCounts: Record<TaskLifecycle, number> = {
        Pending: 0, Queued: 0, Running: 0, Paused: 0, Completed: 0, Failed: 0, Cancelled: 0, Retrying: 0, RolledBack: 0
    };
    private totalArtifactsCount = 0;

    constructor(
        private readonly workspaceRoot: string,
        workspaceEngine?: WorkspaceEngine
    ) {
        this.engine = new RuntimeEngine(this.registry);
        this.workspaceEngine = workspaceEngine;
        // Register default Mock provider
        this.registry.register(new MockAgentProvider());
    }

    addMiddleware(middleware: RuntimeMiddleware): void {
        this.middlewares.push(middleware);
    }

    addHooks(hooks: RuntimeHooks): void {
        this.hooks.push(hooks);
        // Trigger register hook synchronously
        const list = this.registry.list();
        if (hooks.onProviderRegistered) {
            for (const desc of list) {
                const prov = this.registry.get(desc.id);
                if (prov) {
                    try {
                        hooks.onProviderRegistered(prov);
                    } catch (e) {}
                }
            }
        }
    }

    async execute(
        request: RuntimeRequest,
        onEvent: (event: RuntimeEvent) => void = () => {}
    ): Promise<RuntimeResponse> {
        const startExecution = Date.now();
        this.taskCounts.Queued++;

        // Evaluate and record capability negotiation provider selection reasoning
        const providers = this.registry.discover(request.task.type);
        const reasoning = `Negotiating capability: '${request.task.type}'. Candidates count: ${providers.length}. `;
        if (providers.length > 0) {
            const selected = providers[0];
            this.providerSelectionReasoning.push(
                reasoning + `Selected '${selected.name}' (ID: ${selected.id}) with priority ${selected.priority ?? 0}, health '${selected.health || "Healthy"}', version '${selected.version || "1.0.0"}'.`
            );
        } else {
            this.providerSelectionReasoning.push(reasoning + "No compatible healthy providers found.");
        }

        const executor = new RuntimeExecutor(this.engine, this.middlewares, this.hooks, this.timings);
        
        // Setup snapshot recovery tracking variables
        const runningTasks = [request.task.id];
        const completedTasks: string[] = [];
        const providerAssignments: Record<string, string> = {};
        const retryCounts: Record<string, number> = {};

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
            } catch (wsErr: any) {
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
        } else {
            this.taskCounts[response.status] = 1;
        }

        return response;
    }

    register(provider: AgentProvider): void {
        this.registry.register(provider);
        // Trigger register hook synchronously
        for (const h of this.hooks) {
            if (h.onProviderRegistered) {
                try {
                    h.onProviderRegistered(provider);
                } catch (e) {}
            }
        }
    }

    unregister(id: string): void {
        this.registry.unregister(id);
        // Trigger remove hook synchronously
        for (const h of this.hooks) {
            if (h.onProviderRemoved) {
                try {
                    h.onProviderRemoved(id);
                } catch (e) {}
            }
        }
    }

    providers(): AgentDescriptor[] {
        return this.registry.list();
    }

    capabilities(): AgentCapability[] {
        const caps = new Set<AgentCapability>();
        for (const p of this.registry.list()) {
            for (const c of p.capabilities) {
                caps.add(c);
            }
        }
        return Array.from(caps);
    }

    diagnostics(): RuntimeDiagnostics {
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

    async shutdown(): Promise<void> {
        const list = this.registry.list();
        for (const desc of list) {
            const provider = this.registry.get(desc.id);
            if (provider) {
                try {
                    await provider.shutdown();
                } catch (e) {}
            }
        }

        // Trigger runtime shutdown hook synchronously
        for (const h of this.hooks) {
            if (h.onRuntimeShutdown) {
                try {
                    h.onRuntimeShutdown();
                } catch (e) {}
            }
        }
    }

    private persistEvent(event: RuntimeEvent): void {
        try {
            const runtimeDir = path.join(this.workspaceRoot, "runtime");
            if (!fs.existsSync(runtimeDir)) {
                fs.mkdirSync(runtimeDir, { recursive: true });
            }
            const eventsFile = path.join(runtimeDir, "events.jsonl");
            fs.appendFileSync(eventsFile, JSON.stringify(event) + "\n");
        } catch (err) {}
    }

    private saveSnapshot(
        runningTasks: string[],
        completedTasks: string[],
        providerAssignments: Record<string, string>,
        retryCounts: Record<string, number>
    ): string {
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
        } catch (err) {}
        return snapshotId;
    }

    async recover(): Promise<any | null> {
        try {
            const snapshotFile = path.join(this.workspaceRoot, "runtime", "snapshot.json");
            if (fs.existsSync(snapshotFile)) {
                return JSON.parse(fs.readFileSync(snapshotFile, "utf-8"));
            }
        } catch (err) {}
        return null;
    }

    replay(taskId: string): RuntimeEvent[] {
        const events: RuntimeEvent[] = [];
        try {
            const eventsFile = path.join(this.workspaceRoot, "runtime", "events.jsonl");
            if (fs.existsSync(eventsFile)) {
                const lines = fs.readFileSync(eventsFile, "utf-8").split("\n");
                for (const line of lines) {
                    if (!line.trim()) continue;
                    const ev = JSON.parse(line) as RuntimeEvent;
                    if (ev.taskId === taskId) {
                        events.push(ev);
                    }
                }
            }
        } catch (err) {}
        this.replayStatistics.totalReplayed += events.length;
        return events;
    }

    replaySession(sessionId: string): RuntimeEvent[] {
        const events: RuntimeEvent[] = [];
        try {
            const eventsFile = path.join(this.workspaceRoot, "runtime", "events.jsonl");
            if (fs.existsSync(eventsFile)) {
                const lines = fs.readFileSync(eventsFile, "utf-8").split("\n");
                for (const line of lines) {
                    if (!line.trim()) continue;
                    const ev = JSON.parse(line) as RuntimeEvent;
                    if (ev.sessionId === sessionId) {
                        events.push(ev);
                    }
                }
            }
        } catch (err) {}
        this.replayStatistics.totalReplayed += events.length;
        this.replayStatistics.lastReplayedSession = sessionId;
        return events;
    }

    getSessionId(): string {
        return this.sessionId;
    }
}
