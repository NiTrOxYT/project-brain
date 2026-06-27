// ──────────────────────────────────────────────────────────────────────────────
// BUILD-054 — Context Compiler — Errors
// ──────────────────────────────────────────────────────────────────────────────

export class ContextCompilerError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ContextCompilerError";
    }
}

export class SnapshotCompilationError extends ContextCompilerError {
    constructor(message: string) {
        super(message);
        this.name = "SnapshotCompilationError";
    }
}

export class SnapshotValidationError extends ContextCompilerError {
    constructor(message: string) {
        super(message);
        this.name = "SnapshotValidationError";
    }
}

export class SnapshotCacheError extends ContextCompilerError {
    constructor(message: string) {
        super(message);
        this.name = "SnapshotCacheError";
    }
}

export class SnapshotStorageError extends ContextCompilerError {
    constructor(message: string) {
        super(message);
        this.name = "SnapshotStorageError";
    }
}

export class SnapshotMergeError extends ContextCompilerError {
    constructor(message: string) {
        super(message);
        this.name = "SnapshotMergeError";
    }
}

export class SnapshotFingerprintError extends ContextCompilerError {
    constructor(message: string) {
        super(message);
        this.name = "SnapshotFingerprintError";
    }
}
