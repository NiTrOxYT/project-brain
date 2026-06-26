// ──────────────────────────────────────────────────────────────────────────────
// BUILD-051 — Autonomous Execution Loop — Errors
// ──────────────────────────────────────────────────────────────────────────────

export class AutonomousRuntimeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AutonomousRuntimeError";
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export class ValidationError extends AutonomousRuntimeError {
    constructor(message: string, public readonly details?: string[]) {
        super(message);
        this.name = "ValidationError";
    }
}

export class RepairError extends AutonomousRuntimeError {
    constructor(message: string, public readonly taskId: string) {
        super(message);
        this.name = "RepairError";
    }
}

export class LoopTimeoutError extends AutonomousRuntimeError {
    constructor(message: string) {
        super(message);
        this.name = "LoopTimeoutError";
    }
}

export class ExecutionAbortedError extends AutonomousRuntimeError {
    constructor(message: string) {
        super(message);
        this.name = "ExecutionAbortedError";
    }
}

export class CheckpointError extends AutonomousRuntimeError {
    constructor(message: string) {
        super(message);
        this.name = "CheckpointError";
    }
}

export class RecoveryError extends AutonomousRuntimeError {
    constructor(message: string) {
        super(message);
        this.name = "RecoveryError";
    }
}
