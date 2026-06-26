// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050A — Provider Execution Layer — Errors
// ──────────────────────────────────────────────────────────────────────────────
export class ProviderExecutionError extends Error {
    requestId;
    code = "PROVIDER_EXECUTION_ERROR";
    constructor(message, requestId) {
        super(message);
        this.requestId = requestId;
        this.name = "ProviderExecutionError";
    }
}
export class ProcessSpawnError extends ProviderExecutionError {
    executable;
    code = "PROCESS_SPAWN_ERROR";
    constructor(executable, message, requestId) {
        super(`Failed to spawn '${executable}': ${message}`, requestId);
        this.executable = executable;
        this.name = "ProcessSpawnError";
    }
}
export class ProcessTimeoutError extends ProviderExecutionError {
    timeoutKind;
    elapsedMs;
    code = "PROCESS_TIMEOUT_ERROR";
    retryable = false;
    constructor(timeoutKind, elapsedMs, requestId) {
        super(`Process ${timeoutKind} timeout after ${elapsedMs}ms`, requestId);
        this.timeoutKind = timeoutKind;
        this.elapsedMs = elapsedMs;
        this.name = "ProcessTimeoutError";
    }
}
export class ProcessCancelledError extends ProviderExecutionError {
    code = "PROCESS_CANCELLED";
    retryable = false;
    constructor(requestId) {
        super("Process execution was cancelled", requestId);
        this.name = "ProcessCancelledError";
    }
}
export class ProcessExitedError extends ProviderExecutionError {
    exitCode;
    stderr;
    code = "PROCESS_EXITED_ERROR";
    constructor(exitCode, stderr, requestId) {
        super(`Process exited with code ${exitCode}${stderr ? `: ${stderr.slice(0, 200)}` : ""}`, requestId);
        this.exitCode = exitCode;
        this.stderr = stderr;
        this.name = "ProcessExitedError";
    }
}
export class InvalidExecutableError extends ProviderExecutionError {
    executable;
    code = "INVALID_EXECUTABLE";
    retryable = false;
    constructor(executable, requestId) {
        super(`Executable not found or not executable: '${executable}'`, requestId);
        this.executable = executable;
        this.name = "InvalidExecutableError";
    }
}
export class SandboxError extends ProviderExecutionError {
    code = "SANDBOX_ERROR";
    constructor(message, requestId) {
        super(`Sandbox error: ${message}`, requestId);
        this.name = "SandboxError";
    }
}
export class StreamError extends ProviderExecutionError {
    channel;
    code = "STREAM_ERROR";
    constructor(channel, message, requestId) {
        super(`Stream error on ${channel}: ${message}`, requestId);
        this.channel = channel;
        this.name = "StreamError";
    }
}
/** Whether an error from a non-zero exit code is transient (retryable). */
export function isTransientExitCode(exitCode, permanentCodes) {
    if (permanentCodes.includes(exitCode))
        return false;
    // Exit codes 1 (general error) and 2 (misuse) are transient by default.
    // Everything >= 126 is a shell/spawn error — permanent.
    if (exitCode >= 126)
        return false;
    return true;
}
