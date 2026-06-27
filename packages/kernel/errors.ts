// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — Kernel — Unified Error Hierarchy
// Base class with severity, recoverable flags, category and metadata fields.
// ──────────────────────────────────────────────────────────────────────────────

export type ErrorSeverity = "fatal" | "recoverable" | "warning";

export class ProjectBrainError extends Error {
    constructor(
        message: string,
        public readonly category:  string,
        public readonly code =     "BRAIN_ERROR",
        public readonly severity:  ErrorSeverity = "fatal",
        public readonly recoverable = severity !== "fatal",
        public readonly metadata:  Readonly<Record<string, unknown>> = {}
    ) {
        super(message);
        this.name = "ProjectBrainError";
    }
}

export class KernelError extends ProjectBrainError {
    constructor(message: string, code = "KERNEL_ERROR", severity: ErrorSeverity = "fatal", metadata = {}) {
        super(message, "kernel", code, severity, severity !== "fatal", metadata);
        this.name = "KernelError";
    }
}

export class GatewayError extends ProjectBrainError {
    constructor(message: string, code = "GATEWAY_ERROR", severity: ErrorSeverity = "fatal", metadata = {}) {
        super(message, "gateway", code, severity, severity !== "fatal", metadata);
        this.name = "GatewayError";
    }
}

export class ProviderError extends ProjectBrainError {
    constructor(message: string, code = "PROVIDER_ERROR", severity: ErrorSeverity = "fatal", metadata = {}) {
        super(message, "provider", code, severity, severity !== "fatal", metadata);
        this.name = "ProviderError";
    }
}

export class StorageError extends ProjectBrainError {
    constructor(message: string, code = "STORAGE_ERROR", severity: ErrorSeverity = "fatal", metadata = {}) {
        super(message, "storage", code, severity, severity !== "fatal", metadata);
        this.name = "StorageError";
    }
}

export class SearchError extends ProjectBrainError {
    constructor(message: string, code = "SEARCH_ERROR", severity: ErrorSeverity = "fatal", metadata = {}) {
        super(message, "search", code, severity, severity !== "fatal", metadata);
        this.name = "SearchError";
    }
}

export class LearningError extends ProjectBrainError {
    constructor(message: string, code = "LEARNING_ERROR", severity: ErrorSeverity = "fatal", metadata = {}) {
        super(message, "learning", code, severity, severity !== "fatal", metadata);
        this.name = "LearningError";
    }
}

export class WorkspaceError extends ProjectBrainError {
    constructor(message: string, code = "WORKSPACE_ERROR", severity: ErrorSeverity = "fatal", metadata = {}) {
        super(message, "workspace", code, severity, severity !== "fatal", metadata);
        this.name = "WorkspaceError";
    }
}
