// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050A — Provider Execution Layer — Types
// Provider-agnostic. No knowledge of Claude, Codex, Gemini, etc.
// ──────────────────────────────────────────────────────────────────────────────

// ─── Process State ────────────────────────────────────────────────────────────

export type ProcessState =
    | "Pending"
    | "Starting"
    | "Running"
    | "Idle"
    | "Completing"
    | "Completed"
    | "Failed"
    | "Cancelled"
    | "TimedOut"
    | "Retrying";

// ─── Stream Chunk ─────────────────────────────────────────────────────────────

export type StreamChannel = "stdout" | "stderr";

export interface StreamChunk {
    channel: StreamChannel;
    data: string;
    /** Byte offset within the stream */
    offset: number;
    /** Monotonic sequence number for ordering */
    sequence: number;
    timestamp: string;
}

// ─── Timeout Policy ───────────────────────────────────────────────────────────

export interface TimeoutPolicy {
    /** Max ms to wait for process to start producing output */
    startupTimeoutMs?: number;
    /** Max ms of silence before considering the process idle-stuck */
    idleTimeoutMs?: number;
    /** Max total execution wall time */
    executionTimeoutMs?: number;
    /** Ms to wait after SIGINT before escalating to SIGTERM */
    gracefulShutdownMs?: number;
    /** Ms to wait after SIGTERM before forcing SIGKILL */
    forceKillMs?: number;
}

// ─── Retry Policy ─────────────────────────────────────────────────────────────

export interface RetryPolicy {
    maxRetries: number;
    /** Base delay between retries in ms */
    baseDelayMs: number;
    /** Multiply delay by this factor each retry (1 = constant, 2 = exponential) */
    backoffFactor: number;
    /** Max delay cap in ms */
    maxDelayMs: number;
    /** Exit codes that should not be retried */
    permanentFailureCodes: number[];
}

// ─── Resource Usage ───────────────────────────────────────────────────────────

export interface ResourceUsage {
    /** Peak RSS memory in bytes (when available) */
    peakRssBytes?: number;
    /** User CPU time in ms (when available) */
    userCpuMs?: number;
    /** System CPU time in ms (when available) */
    systemCpuMs?: number;
}

// ─── Execution Request ────────────────────────────────────────────────────────

export interface ExecutionRequest {
    /** Unique request identifier */
    id: string;
    /** Full path to executable */
    executable: string;
    /** Command-line arguments */
    args: string[];
    /** Working directory for the process */
    cwd: string;
    /** Environment variables (merged with process.env when includeParentEnv = true) */
    env: Record<string, string>;
    /** Whether to inherit parent process environment */
    includeParentEnv: boolean;
    /** Optional stdin data to pipe in */
    stdin?: string;
    /** Timeout policy — if omitted, no timeouts applied */
    timeout?: TimeoutPolicy;
    /** Retry policy — if omitted, no retries */
    retry?: RetryPolicy;
    /** Whether to use an isolated sandbox directory */
    useSandbox?: boolean;
    /** Tags for diagnostics/logging */
    tags?: Record<string, string>;
}

// ─── Process Handle ───────────────────────────────────────────────────────────

export interface ProcessHandle {
    /** OS process ID */
    pid: number;
    /** Request that spawned this process */
    requestId: string;
    /** Current state */
    state: ProcessState;
    /** When the process was spawned */
    startedAt: string;
}

// ─── Process Output ───────────────────────────────────────────────────────────

export interface ProcessOutput {
    stdout: string;
    stderr: string;
    stdoutBytes: number;
    stderrBytes: number;
    chunks: StreamChunk[];
}

// ─── Execution Metrics ────────────────────────────────────────────────────────

export interface ExecutionMetrics {
    requestId: string;
    executable: string;
    startedAt: string;
    completedAt: string;
    durationMs: number;
    exitCode: number | null;
    signal: string | null;
    stdoutBytes: number;
    stderrBytes: number;
    retryCount: number;
    timeoutCause?: "startup" | "idle" | "execution";
    resourceUsage?: ResourceUsage;
}

// ─── Execution Result ─────────────────────────────────────────────────────────

export interface ExecutionResult {
    requestId: string;
    state: ProcessState;
    exitCode: number | null;
    signal: string | null;
    output: ProcessOutput;
    metrics: ExecutionMetrics;
    /** Non-empty only when process failed */
    error?: string;
}

// ─── Execution Diagnostics ────────────────────────────────────────────────────

export interface ExecutionDiagnostics {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    cancelledExecutions: number;
    totalRetries: number;
    totalTimeouts: number;
    averageDurationMs: number;
    activePids: number[];
    sandboxDirectories: string[];
}
