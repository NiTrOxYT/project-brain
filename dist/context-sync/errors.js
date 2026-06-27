export class ContextSynchronizationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ContextSynchronizationError";
    }
}
export class SnapshotPatchError extends ContextSynchronizationError {
    constructor(message) {
        super(message);
        this.name = "SnapshotPatchError";
    }
}
export class InvalidSnapshotError extends ContextSynchronizationError {
    constructor(message) {
        super(message);
        this.name = "InvalidSnapshotError";
    }
}
export class DependencyResolutionError extends ContextSynchronizationError {
    constructor(message) {
        super(message);
        this.name = "DependencyResolutionError";
    }
}
export class GraphSynchronizationError extends ContextSynchronizationError {
    constructor(message) {
        super(message);
        this.name = "GraphSynchronizationError";
    }
}
export class IncrementalCompilationError extends ContextSynchronizationError {
    constructor(message) {
        super(message);
        this.name = "IncrementalCompilationError";
    }
}
