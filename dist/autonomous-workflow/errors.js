export class WorkflowError extends Error {
    details;
    constructor(message, details) {
        super(message);
        this.details = details;
        this.name = "WorkflowError";
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
export class PlanningError extends WorkflowError {
    constructor(message, details) {
        super(message, details);
        this.name = "PlanningError";
    }
}
export class ExecutionError extends WorkflowError {
    constructor(message, details) {
        super(message, details);
        this.name = "ExecutionError";
    }
}
export class ValidationError extends WorkflowError {
    constructor(message, details) {
        super(message, details);
        this.name = "ValidationError";
    }
}
export class RepairError extends WorkflowError {
    constructor(message, details) {
        super(message, details);
        this.name = "RepairError";
    }
}
export class RecoveryError extends WorkflowError {
    constructor(message, details) {
        super(message, details);
        this.name = "RecoveryError";
    }
}
export class CheckpointError extends WorkflowError {
    constructor(message, details) {
        super(message, details);
        this.name = "CheckpointError";
    }
}
