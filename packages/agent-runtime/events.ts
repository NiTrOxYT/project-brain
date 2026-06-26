export type RuntimeEventType =
    | "TaskStarted"
    | "TaskProgress"
    | "TaskCompleted"
    | "TaskFailed"
    | "TaskCancelled"
    | "TaskPaused"
    | "TaskResumed"
    | "ArtifactProduced"
    | "RetryStarted"
    | "RollbackStarted";

export interface RuntimeEvent {
    type: RuntimeEventType;
    taskId: string;
    timestamp: string;
    payload?: any;
    sessionId?: string;
}
