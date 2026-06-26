// ──────────────────────────────────────────────────────────────────────────────
// BUILD-048 — Workspace Execution Engine — Errors
// ──────────────────────────────────────────────────────────────────────────────
export class WorkspaceEngineError extends Error {
    code = "WORKSPACE_ENGINE_ERROR";
    constructor(message) {
        super(message);
        this.name = "WorkspaceEngineError";
    }
}
export class WorkspaceTransactionError extends WorkspaceEngineError {
    transactionId;
    code = "WORKSPACE_TRANSACTION_ERROR";
    constructor(transactionId, message) {
        super(`[tx:${transactionId}] ${message}`);
        this.transactionId = transactionId;
        this.name = "WorkspaceTransactionError";
    }
}
export class WorkspaceLockError extends WorkspaceEngineError {
    path;
    lockedByTransactionId;
    code = "WORKSPACE_LOCK_ERROR";
    constructor(path, lockedByTransactionId, requestingTransactionId) {
        super(`Path '${path}' is locked by transaction '${lockedByTransactionId}'. ` +
            `Transaction '${requestingTransactionId}' cannot acquire the lock.`);
        this.path = path;
        this.lockedByTransactionId = lockedByTransactionId;
        this.name = "WorkspaceLockError";
    }
}
export class WorkspaceValidationError extends WorkspaceEngineError {
    path;
    code = "WORKSPACE_VALIDATION_ERROR";
    constructor(path, message) {
        super(`Validation failed for '${path}': ${message}`);
        this.path = path;
        this.name = "WorkspaceValidationError";
    }
}
export class WorkspacePatchError extends WorkspaceEngineError {
    path;
    code = "WORKSPACE_PATCH_ERROR";
    constructor(path, message) {
        super(`Patch failed for '${path}': ${message}`);
        this.path = path;
        this.name = "WorkspacePatchError";
    }
}
