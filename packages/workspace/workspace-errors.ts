// ──────────────────────────────────────────────────────────────────────────────
// BUILD-048 — Workspace Execution Engine — Errors
// ──────────────────────────────────────────────────────────────────────────────

export class WorkspaceEngineError extends Error {
    readonly code: string = "WORKSPACE_ENGINE_ERROR";
    constructor(message: string) {
        super(message);
        this.name = "WorkspaceEngineError";
    }
}

export class WorkspaceTransactionError extends WorkspaceEngineError {
    override readonly code: string = "WORKSPACE_TRANSACTION_ERROR";
    constructor(
        public readonly transactionId: string,
        message: string
    ) {
        super(`[tx:${transactionId}] ${message}`);
        this.name = "WorkspaceTransactionError";
    }
}

export class WorkspaceLockError extends WorkspaceEngineError {
    override readonly code: string = "WORKSPACE_LOCK_ERROR";
    constructor(
        public readonly path: string,
        public readonly lockedByTransactionId: string,
        requestingTransactionId: string
    ) {
        super(
            `Path '${path}' is locked by transaction '${lockedByTransactionId}'. ` +
            `Transaction '${requestingTransactionId}' cannot acquire the lock.`
        );
        this.name = "WorkspaceLockError";
    }
}

export class WorkspaceValidationError extends WorkspaceEngineError {
    override readonly code: string = "WORKSPACE_VALIDATION_ERROR";
    constructor(
        public readonly path: string,
        message: string
    ) {
        super(`Validation failed for '${path}': ${message}`);
        this.name = "WorkspaceValidationError";
    }
}

export class WorkspacePatchError extends WorkspaceEngineError {
    override readonly code: string = "WORKSPACE_PATCH_ERROR";
    constructor(
        public readonly path: string,
        message: string
    ) {
        super(`Patch failed for '${path}': ${message}`);
        this.name = "WorkspacePatchError";
    }
}
