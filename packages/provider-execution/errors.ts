// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050A — Provider Execution Layer — Errors
// ──────────────────────────────────────────────────────────────────────────────

export class ProviderExecutionError extends Error {
    readonly code: string = "PROVIDER_EXECUTION_ERROR";
    constructor(message: string, public readonly requestId?: string) {
        super(message);
        this.name = "ProviderExecutionError";
    }
}

export class ProcessSpawnError extends ProviderExecutionError {
    override readonly code = "PROCESS_SPAWN_ERROR";
    constructor(
        public readonly executable: string,
        message: string,
        requestId?: string
    ) {
        super(`Failed to spawn '${executable}': ${message}`, requestId);
        this.name = "ProcessSpawnError";
    }
}

export class ProcessTimeoutError extends ProviderExecutionError {
    override readonly code = "PROCESS_TIMEOUT_ERROR";
    readonly retryable = false;
    constructor(
        public readonly timeoutKind: "startup" | "idle" | "execution",
        public readonly elapsedMs: number,
        requestId?: string
    ) {
        super(
            `Process ${timeoutKind} timeout after ${elapsedMs}ms`,
            requestId
        );
        this.name = "ProcessTimeoutError";
    }
}

export class ProcessCancelledError extends ProviderExecutionError {
    override readonly code = "PROCESS_CANCELLED";
    readonly retryable = false;
    constructor(requestId?: string) {
        super("Process execution was cancelled", requestId);
        this.name = "ProcessCancelledError";
    }
}

export class ProcessExitedError extends ProviderExecutionError {
    override readonly code = "PROCESS_EXITED_ERROR";
    constructor(
        public readonly exitCode: number,
        public readonly stderr: string,
        requestId?: string
    ) {
        super(
            `Process exited with code ${exitCode}${stderr ? `: ${stderr.slice(0, 200)}` : ""}`,
            requestId
        );
        this.name = "ProcessExitedError";
    }
}

export class InvalidExecutableError extends ProviderExecutionError {
    override readonly code = "INVALID_EXECUTABLE";
    readonly retryable = false;
    constructor(public readonly executable: string, requestId?: string) {
        super(`Executable not found or not executable: '${executable}'`, requestId);
        this.name = "InvalidExecutableError";
    }
}

export class SandboxError extends ProviderExecutionError {
    override readonly code = "SANDBOX_ERROR";
    constructor(message: string, requestId?: string) {
        super(`Sandbox error: ${message}`, requestId);
        this.name = "SandboxError";
    }
}

export class StreamError extends ProviderExecutionError {
    override readonly code = "STREAM_ERROR";
    constructor(
        public readonly channel: "stdout" | "stderr",
        message: string,
        requestId?: string
    ) {
        super(`Stream error on ${channel}: ${message}`, requestId);
        this.name = "StreamError";
    }
}

/** Whether an error from a non-zero exit code is transient (retryable). */
export function isTransientExitCode(exitCode: number, permanentCodes: number[]): boolean {
    if (permanentCodes.includes(exitCode)) return false;
    // Exit codes 1 (general error) and 2 (misuse) are transient by default.
    // Everything >= 126 is a shell/spawn error — permanent.
    if (exitCode >= 126) return false;
    return true;
}
