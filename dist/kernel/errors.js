// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — Kernel — Unified Error Hierarchy
// Base class with severity, recoverable flags, category and metadata fields.
// ──────────────────────────────────────────────────────────────────────────────
export class ProjectBrainError extends Error {
    category;
    code;
    severity;
    recoverable;
    metadata;
    constructor(message, category, code = "BRAIN_ERROR", severity = "fatal", recoverable = severity !== "fatal", metadata = {}) {
        super(message);
        this.category = category;
        this.code = code;
        this.severity = severity;
        this.recoverable = recoverable;
        this.metadata = metadata;
        this.name = "ProjectBrainError";
    }
}
export class KernelError extends ProjectBrainError {
    constructor(message, code = "KERNEL_ERROR", severity = "fatal", metadata = {}) {
        super(message, "kernel", code, severity, severity !== "fatal", metadata);
        this.name = "KernelError";
    }
}
export class GatewayError extends ProjectBrainError {
    constructor(message, code = "GATEWAY_ERROR", severity = "fatal", metadata = {}) {
        super(message, "gateway", code, severity, severity !== "fatal", metadata);
        this.name = "GatewayError";
    }
}
export class ProviderError extends ProjectBrainError {
    constructor(message, code = "PROVIDER_ERROR", severity = "fatal", metadata = {}) {
        super(message, "provider", code, severity, severity !== "fatal", metadata);
        this.name = "ProviderError";
    }
}
export class StorageError extends ProjectBrainError {
    constructor(message, code = "STORAGE_ERROR", severity = "fatal", metadata = {}) {
        super(message, "storage", code, severity, severity !== "fatal", metadata);
        this.name = "StorageError";
    }
}
export class SearchError extends ProjectBrainError {
    constructor(message, code = "SEARCH_ERROR", severity = "fatal", metadata = {}) {
        super(message, "search", code, severity, severity !== "fatal", metadata);
        this.name = "SearchError";
    }
}
export class LearningError extends ProjectBrainError {
    constructor(message, code = "LEARNING_ERROR", severity = "fatal", metadata = {}) {
        super(message, "learning", code, severity, severity !== "fatal", metadata);
        this.name = "LearningError";
    }
}
export class WorkspaceError extends ProjectBrainError {
    constructor(message, code = "WORKSPACE_ERROR", severity = "fatal", metadata = {}) {
        super(message, "workspace", code, severity, severity !== "fatal", metadata);
        this.name = "WorkspaceError";
    }
}
