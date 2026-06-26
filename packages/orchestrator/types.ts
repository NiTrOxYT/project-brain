import { EngineeringPlan } from "../engineering-planner";

export type AgentCapability = "analyze" | "code" | "test" | "validate" | "cleanup";
export type AgentStatus = "idle" | "busy" | "offline";
export type TaskStatus = "pending" | "running" | "completed" | "failed" | "skipped";
export type ExecutionStage = "init" | "running" | "rollback" | "completed" | "failed";

export interface Worker {
    id: string;
    capabilities: AgentCapability[];
    status: AgentStatus;
    currentTaskId?: string;
}

export interface ExecutionResult {
    taskId: string;
    status: TaskStatus;
    error?: string;
    output?: string;
    executionTimeMs: number;
}

export interface ScheduleBatch {
    batchIndex: number;
    phaseId: string;
    taskIds: string[];
}

export interface ExecutionSchedule {
    batches: ScheduleBatch[];
}

export interface ExecutionReport {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    skippedTasks: number;
    parallelism: number;
    executionDepth: number;
    criticalPathLength: number;
    retries: number;
    rollbackCount: number;
    executionTime: number;
    selectedProvider?: string;
    providerHealth?: string;
    runtimeMetricsSummary?: any;
    executionSnapshotId?: string;
}

export interface WorkerAssignment {
    taskId: string;
    workerId: string;
}

export interface OrchestratorRequest {
    plan: EngineeringPlan;
    maxParallelWorkers?: number;
    simulateFailures?: string[];
}

export interface OrchestratorResponse {
    plan: EngineeringPlan;
    schedule: ExecutionSchedule;
    report: ExecutionReport;
    results: ExecutionResult[];
    assignments: WorkerAssignment[];
}
