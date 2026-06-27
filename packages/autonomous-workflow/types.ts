import { EngineeringPlan, ExecutionNode, EngineeringPhase } from "../engineering-planner/types";
import { ExecutionLoopResult, LoopMetrics, ExecutionCheckpoint, ExecutionFailure } from "../autonomous-runtime/types";
import { RetrievalResult } from "../context-retrieval/types";
import { PromptPackage } from "../prompt-intelligence/types";

export type WorkflowState =
    | "Pending"
    | "Planning"
    | "Scheduling"
    | "Executing"
    | "Validating"
    | "Repairing"
    | "Learning"
    | "Completed"
    | "Failed"
    | "Cancelled"
    | "Recovered";

export interface WorkflowRequest {
    workflowId: string;
    issue: string;
    projectRoot: string;
    workspaceRoot: string;
    maxParallelWorkers?: number;
    maxRetries?: number;
    maxRepairs?: number;
    validators?: Array<{
        type: "compile" | "test" | "custom";
        command: string;
        timeoutMs?: number;
    }>;
    useCache?: boolean;
}

export interface WorkflowResult {
    workflowId: string;
    status: "Completed" | "Failed" | "Cancelled";
    report: WorkflowSummary;
}

export interface WorkflowPhase {
    id: string;
    name: string;
    tasks: string[];
}

export interface WorkflowTask extends ExecutionNode {}

export interface WorkflowCheckpoint {
    workflowId: string;
    state: WorkflowState;
    plan: EngineeringPlan | null;
    completedTasks: string[];
    failedTasks: string[];
    workspaceTransactionIds: Record<string, string>;
    providerSessions: Record<string, string>;
    retryCounters: Record<string, number>;
    repairCounters: Record<string, number>;
    metrics: WorkflowMetrics;
    timestamp: string;
}

export interface WorkflowMetrics {
    workflowDurationMs: number;
    planningDurationMs: number;
    executionDurationMs: number;
    validationDurationMs: number;
    repairDurationMs: number;
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    repairedTasks: number;
    retries: number;
    validationCount: number;
    repairCount: number;
    providerUsage: Record<string, number>;
    promptTokens: number;
    completionTokens: number;
    estimatedCost: number;
    successRate: number;
}

export interface WorkflowStatistics {
    totalWorkflows: number;
    successRate: number;
    averageDurationMs: number;
    averageCost: number;
    averageTokens: number;
}

export interface WorkflowJournal {
    workflowId: string;
    events: JournalEvent[];
}

export interface JournalEvent {
    type:
        | "WorkflowStarted"
        | "PlanningStarted"
        | "PlanningCompleted"
        | "ExecutionStarted"
        | "ExecutionCompleted"
        | "ValidationStarted"
        | "ValidationPassed"
        | "ValidationFailed"
        | "RepairStarted"
        | "RepairCompleted"
        | "LearningStarted"
        | "LearningCompleted"
        | "WorkflowCompleted"
        | "WorkflowFailed"
        | "WorkflowCancelled"
        | "WorkflowRecovered"
        | "TaskCompleted";
    timestamp: string;
    payload?: Record<string, any>;
}

export interface WorkflowDiagnostics {
    workflowId: string;
    interrupted: boolean;
    recoveryCount: number;
    activeLocks: string[];
    lastActivePhase: WorkflowState;
}

export interface WorkflowFailure extends ExecutionFailure {}

export interface WorkflowRecovery {
    checkpointId: string;
    restoredState: WorkflowState;
    timestamp: string;
}

export interface WorkflowRecommendation {
    recommendedProvider: string;
    recommendedRepairStrategy?: string;
    recommendedPrompt?: string;
    rulesApplied: string[];
}

export interface WorkflowSummary {
    workflowId: string;
    issue: string;
    status: "Completed" | "Failed" | "Cancelled";
    timeline: Array<{ stage: string; timestamp: string; durationMs?: number }>;
    taskGraph: {
        nodes: string[];
        edges: Array<{ from: string; to: string }>;
    };
    changedFiles: string[];
    providersUsed: string[];
    validationResults: Array<{
        success: boolean;
        type: string;
        message?: string;
        errors?: string[];
        durationMs: number;
    }>;
    repairHistory: Array<{
        taskId: string;
        reason: string;
        success: boolean;
        durationMs: number;
    }>;
    learningSummary?: {
        recordsAdded: number;
        success: boolean;
    };
    recommendations: WorkflowRecommendation | null;
    diagnostics: WorkflowDiagnostics;
    metrics: WorkflowMetrics;
}

export interface WorkflowValidationResult {
    success: boolean;
    results: Array<{
        success: boolean;
        type: "compile" | "test" | "custom" | "workspace";
        message?: string;
        errors?: string[];
        durationMs: number;
    }>;
}
