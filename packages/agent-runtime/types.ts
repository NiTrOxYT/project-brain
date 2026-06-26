import { RuntimeArtifact } from "./artifacts";
export type { RuntimeEvent } from "./events";

export type AgentCapability =
    | "analyze"
    | "create"
    | "modify"
    | "refactor"
    | "delete"
    | "validate"
    | "document"
    | "test"
    | "cleanup"
    | string;

export type TaskLifecycle =
    | "Pending"
    | "Queued"
    | "Running"
    | "Paused"
    | "Completed"
    | "Failed"
    | "Cancelled"
    | "Retrying"
    | "RolledBack";

export interface RuntimeTask {
    id: string;
    type: AgentCapability;
    title: string;
    file?: string;
    symbol?: string;
    status: TaskLifecycle;
    prerequisites: string[];
    estimatedLOC?: number;
    estimatedTokens?: number;
}

export interface RuntimeContext {
    workspaceRoot: string;
    simulateFailure?: boolean;
    [key: string]: any;
}

export interface RuntimeRequest {
    task: RuntimeTask;
    context: RuntimeContext;
}

export interface AgentDescriptor {
    id: string;
    name: string;
    capabilities: AgentCapability[];
    priority?: number;
    version?: string;
    supportedRuntimeVersion?: string;
    health?: "Healthy" | "Degraded" | "Offline";
    registeredAt?: string;
    metadata?: Record<string, any>;
}

export interface RuntimeMetrics {
    provider: string;
    capability: AgentCapability;
    executionTime: number;
    retries: number;
    artifactsProduced: number;
    eventsEmitted: number;
    taskCount: number;
    cancellationCount: number;
    pauseCount: number;
    resumeCount: number;
}

export interface RuntimeDiagnostics {
    totalExecutionTimeMs: number;
    taskCounts: Record<TaskLifecycle, number>;
    artifactsCount: number;
    providerSelectionReasoning?: string[];
    middlewareTimings?: Record<string, number>;
    hookTimings?: Record<string, number>;
    eventCounts?: Record<string, number>;
    replayStatistics?: Record<string, any>;
    snapshotStatistics?: Record<string, any>;
}

export interface RuntimeResponse {
    taskId: string;
    status: TaskLifecycle;
    error?: string;
    artifacts: RuntimeArtifact[];
    metrics: RuntimeMetrics;
}
