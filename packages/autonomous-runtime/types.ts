// ──────────────────────────────────────────────────────────────────────────────
// BUILD-051 — Autonomous Execution Loop — Types
// ──────────────────────────────────────────────────────────────────────────────

import { EngineeringPlan, ExecutionNode } from "../engineering-planner/types";
import { RuntimeRequest } from "../agent-runtime/types";

export type ExecutionPhase =
    | "loading"
    | "executing"
    | "validating"
    | "repairing"
    | "completed"
    | "failed"
    | "aborted";

export interface ExecutionLoopRequest {
    plan: EngineeringPlan;
    projectRoot: string;
    workspaceRoot: string;
    validators?: ValidatorConfig[];
    maxRetries?: number; // max retries per task for transient failures
    maxRepairs?: number; // max repair attempts per task
    retryBackoffMs?: number;
}

export interface ValidatorConfig {
    type: "compile" | "test" | "custom";
    command: string;
    timeoutMs?: number;
}

export interface ValidationResult {
    success: boolean;
    type: "compile" | "test" | "custom" | "workspace";
    message?: string;
    errors?: string[];
    durationMs: number;
}

export interface ExecutionFailure {
    taskId?: string;
    phase: ExecutionPhase;
    category:
        | "Compilation"
        | "Runtime"
        | "Test"
        | "Workspace"
        | "Provider"
        | "Timeout"
        | "Cancellation"
        | "Dependency"
        | "Permanent"
        | "Transient";
    message: string;
    details?: string;
    timestamp: string;
}

export interface RepairAction {
    taskId: string;
    reason: string;
    affectedFiles: string[];
    newRequest: RuntimeRequest;
    retryStrategy: "retry_same" | "refactor" | "rollback";
    confidence: number;
}

export interface LoopMetrics {
    durationMs: number;
    repairCount: number;
    retryCount: number;
    validationCount: number;
    providerExecutions: number;
    workspaceTransactions: number;
    successRate: number; // 0 to 100
    failureRate: number; // 0 to 100
    timePerPhase: Record<string, number>;
}

export interface ExecutionSummary {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    repairedCount: number;
    retriedCount: number;
    validationFailures: number;
    durationMs: number;
    successPercentage: number;
}

export interface JournalEvent {
    type:
        | "PhaseStarted"
        | "PhaseCompleted"
        | "TaskStarted"
        | "TaskCompleted"
        | "TaskFailed"
        | "ValidationStarted"
        | "ValidationPassed"
        | "ValidationFailed"
        | "RepairStarted"
        | "RepairCompleted"
        | "RetryStarted"
        | "CheckpointSaved"
        | "CheckpointLoaded"
        | "ExecutionCompleted"
        | "ExecutionFailed"
        | "ExecutionAborted"
        | "WorkspaceTransactionApplied";
    timestamp: string;
    payload: Record<string, any>;
}

export interface ExecutionCheckpoint {
    planId: string;
    completedTasks: string[];
    failedTasks: string[];
    activePhase: ExecutionPhase;
    workspaceTransactionIds: Record<string, string>; // taskId -> txId
    providerSessions: Record<string, string>; // providerId -> sessionId
    retryCounters: Record<string, number>; // taskId -> count
    repairCounters: Record<string, number>; // taskId -> count
    metrics: LoopMetrics;
    timestamp: string;
}

export interface ExecutionState {
    planId: string;
    completedTasks: Set<string>;
    failedTasks: Set<string>;
    activePhase: ExecutionPhase;
    workspaceTransactionIds: Map<string, string>;
    providerSessions: Map<string, string>;
    retryCounters: Map<string, number>;
    repairCounters: Map<string, number>;
    metrics: LoopMetrics;
    failures: ExecutionFailure[];
    journal: JournalEvent[];
}

export interface LoopDiagnostics {
    state: ExecutionCheckpoint;
    checkpointCount: number;
    recovered: boolean;
}

export interface ExecutionLoopResult {
    planId: string;
    status: "Completed" | "Failed" | "Aborted";
    summary: ExecutionSummary;
    metrics: LoopMetrics;
    errors: ExecutionFailure[];
    journal: JournalEvent[];
}

export type RetryReason = ExecutionFailure["category"];
export type ExecutionStatistics = LoopMetrics;
export type RecoveryState = ExecutionCheckpoint;
export type ExecutionJournal = JournalEvent[];
