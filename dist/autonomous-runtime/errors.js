// ──────────────────────────────────────────────────────────────────────────────
// BUILD-051 — Autonomous Execution Loop — Errors
// ──────────────────────────────────────────────────────────────────────────────
export class AutonomousRuntimeError extends Error {
    constructor(message) {
        super(message);
        this.name = "AutonomousRuntimeError";
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
export class ValidationError extends AutonomousRuntimeError {
    details;
    constructor(message, details) {
        super(message);
        this.details = details;
        this.name = "ValidationError";
    }
}
export class RepairError extends AutonomousRuntimeError {
    taskId;
    constructor(message, taskId) {
        super(message);
        this.taskId = taskId;
        this.name = "RepairError";
    }
}
export class LoopTimeoutError extends AutonomousRuntimeError {
    constructor(message) {
        super(message);
        this.name = "LoopTimeoutError";
    }
}
export class ExecutionAbortedError extends AutonomousRuntimeError {
    constructor(message) {
        super(message);
        this.name = "ExecutionAbortedError";
    }
}
export class CheckpointError extends AutonomousRuntimeError {
    constructor(message) {
        super(message);
        this.name = "CheckpointError";
    }
}
export class RecoveryError extends AutonomousRuntimeError {
    constructor(message) {
        super(message);
        this.name = "RecoveryError";
    }
}
