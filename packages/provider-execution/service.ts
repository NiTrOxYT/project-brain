// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050A — Provider Execution Layer — ProviderExecutionService
// Orchestrates: process, timeout, retry, stream, sandbox, diagnostics.
// ──────────────────────────────────────────────────────────────────────────────

import {
    ExecutionRequest,
    ExecutionResult,
    ExecutionDiagnostics,
    ProcessState,
    StreamChunk
} from "./types";
import {
    ProcessCancelledError,
    ProcessTimeoutError,
    InvalidExecutableError,
    ProcessSpawnError,
    ProviderExecutionError
} from "./errors";

import { ProcessRunner } from "./process";
import { RetryEvaluator, DEFAULT_RETRY_POLICY } from "./retry";
import { ExecutionSandbox } from "./sandbox";
import { DiagnosticsCollector } from "./diagnostics";

export interface ExecutionServiceOptions {
    maxConcurrentProcesses?: number;
}

export class ProviderExecutionService {
    private readonly runner: ProcessRunner;
    private readonly sandbox: ExecutionSandbox;
    private readonly diag: DiagnosticsCollector;
    private readonly pendingRequests = new Set<string>();
    private isShuttingDown = false;

    constructor(options: ExecutionServiceOptions = {}) {
        this.runner = new ProcessRunner();
        this.sandbox = new ExecutionSandbox();
        this.diag = new DiagnosticsCollector();
    }

    /**
     * Execute a process request with full retry, sandbox, and metrics support.
     * Implements the complete execution lifecycle:
     *   1. Sandbox creation (if useSandbox = true)
     *   2. Process spawn
     *   3. Stream collection
     *   4. Retry on transient failures
     *   5. Metrics recording
     *   6. Sandbox cleanup
     */
    async execute(
        request: ExecutionRequest,
        onChunk?: (chunk: StreamChunk) => void
    ): Promise<ExecutionResult> {
        if (this.isShuttingDown) {
            throw new ProviderExecutionError("Service is shutting down", request.id);
        }

        this.pendingRequests.add(request.id);

        const retryPolicy = request.retry ?? DEFAULT_RETRY_POLICY;
        const evaluator = new RetryEvaluator(retryPolicy);

        // Create sandbox if requested
        let sandboxCwd = request.cwd;
        if (request.useSandbox) {
            const ctx = this.sandbox.create(request.id);
            sandboxCwd = ctx.dir;
        }

        const effectiveRequest = { ...request, cwd: sandboxCwd };

        let lastResult: ExecutionResult | undefined;
        let lastError: Error | undefined;
        let attempt = 0;

        try {
            while (true) {
                try {
                    const result = await this.runner.run(effectiveRequest, {
                        onChunk
                    });

                    // Non-zero exit code — check retry
                    if (result.exitCode !== 0 && result.exitCode !== null) {
                        const decision = evaluator.evaluate(attempt, result.exitCode, undefined);
                        if (decision.shouldRetry) {
                            attempt++;
                            if (decision.delayMs > 0) {
                                await this.sleep(decision.delayMs);
                            }
                            continue;
                        }
                    }

                    // Success or non-retryable exit
                    result.metrics.retryCount = attempt;
                    this.diag.record(result.metrics, result.exitCode === 0 ? "success" : "failed");
                    lastResult = result;
                    return result;

                } catch (err: any) {
                    lastError = err;

                    // Non-retryable errors — rethrow immediately
                    if (
                        err instanceof ProcessCancelledError ||
                        err instanceof ProcessTimeoutError ||
                        err instanceof InvalidExecutableError ||
                        err instanceof ProcessSpawnError
                    ) {
                        const state: "cancelled" | "timeout" | "failed" =
                            err instanceof ProcessCancelledError ? "cancelled" :
                                err instanceof ProcessTimeoutError ? "timeout" :
                                    "failed";
                        // Record metrics if available
                        this.diag.record({
                            requestId: request.id,
                            executable: request.executable,
                            startedAt: new Date().toISOString(),
                            completedAt: new Date().toISOString(),
                            durationMs: 0,
                            exitCode: null,
                            signal: null,
                            stdoutBytes: 0,
                            stderrBytes: 0,
                            retryCount: attempt,
                            timeoutCause: err instanceof ProcessTimeoutError ? err.timeoutKind : undefined
                        }, state);
                        throw err;
                    }

                    // Check retry decision
                    const decision = evaluator.evaluate(attempt, null, err);
                    if (!decision.shouldRetry) {
                        throw err;
                    }

                    attempt++;
                    if (decision.delayMs > 0) {
                        await this.sleep(decision.delayMs);
                    }
                }
            }
        } finally {
            this.pendingRequests.delete(request.id);
            if (request.useSandbox) {
                this.sandbox.cleanup(request.id);
            }
        }
    }

    /**
     * Cancel an in-flight request by ID.
     */
    cancel(requestId: string): void {
        this.runner.cancel(requestId);
    }

    /**
     * Graceful shutdown — cancel all pending requests and clean up sandboxes.
     */
    async shutdown(): Promise<void> {
        this.isShuttingDown = true;
        this.runner.killAll();
        this.sandbox.cleanupAll();

        // Wait briefly for pending requests to settle
        if (this.pendingRequests.size > 0) {
            await this.sleep(200);
        }
    }

    diagnostics(): ExecutionDiagnostics {
        return this.diag.diagnostics(this.sandbox.activeSandboxPaths);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(r => setTimeout(r, ms));
    }
}
