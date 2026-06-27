// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050A — Provider Execution Layer — Low-Level Process Runner
// Spawns child processes, streams stdout/stderr, handles signals and cleanup.
// Uses only Node's built-in child_process APIs. No external libraries.
// ──────────────────────────────────────────────────────────────────────────────
import { spawn } from "child_process";
import { ProcessSpawnError, ProcessCancelledError, InvalidExecutableError, ProcessTimeoutError } from "./errors.js";
import { StreamProcessor } from "./stream.js";
import { TimeoutManager } from "./timeout.js";
export class ProcessRunner {
    activeProcesses = new Map();
    cancelled = new Set();
    /**
     * Execute a process for the given request.
     * Streams stdout/stderr through the StreamProcessor.
     * Resolves with ExecutionResult on completion.
     */
    async run(request, options = {}) {
        const requestId = request.id;
        if (this.cancelled.has(requestId)) {
            throw new ProcessCancelledError(requestId);
        }
        // Validate executable path (basic check — full validation done before reaching here)
        if (!request.executable || request.executable.trim() === "") {
            throw new InvalidExecutableError("(empty)", requestId);
        }
        const startedAt = new Date().toISOString();
        const startMs = Date.now();
        const env = request.includeParentEnv
            ? { ...process.env, ...request.env }
            : { ...request.env };
        const streams = new StreamProcessor(requestId);
        if (options.onChunk) {
            streams.stdout.onChunk(options.onChunk);
            streams.stderr.onChunk(options.onChunk);
        }
        if (options.onLine) {
            streams.stdout.onLine(options.onLine);
            streams.stderr.onLine(options.onLine);
        }
        let child;
        try {
            child = spawn(request.executable, request.args, {
                cwd: request.cwd,
                env,
                shell: false,
                stdio: request.stdin !== undefined ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"]
            });
        }
        catch (err) {
            throw new ProcessSpawnError(request.executable, err.message, requestId);
        }
        // Attach a no-op error handler immediately to absorb async ENOENT before
        // the Promise constructor runs (prevents unhandled error event crash).
        child.on("error", () => { });
        child.stdin?.on("error", () => { });
        child.stdout?.on("error", () => { });
        child.stderr?.on("error", () => { });
        if (!child.pid) {
            throw new ProcessSpawnError(request.executable, "Failed to obtain PID", requestId);
        }
        this.activeProcesses.set(requestId, child);
        // Write stdin if provided
        if (request.stdin !== undefined && child.stdin) {
            try {
                child.stdin.write(request.stdin, "utf-8");
                child.stdin.end();
            }
            catch { }
        }
        else if (child.stdin) {
            child.stdin.end();
        }
        // Setup timeout if configured
        let timeoutManager;
        if (request.timeout) {
            timeoutManager = new TimeoutManager(request.timeout, requestId, (signal) => {
                try {
                    child.kill(signal);
                }
                catch { }
            });
        }
        return new Promise((resolve, reject) => {
            let settled = false;
            const safeResolve = (r) => { if (!settled) {
                settled = true;
                resolve(r);
            } };
            const safeReject = (e) => { if (!settled) {
                settled = true;
                reject(e);
            } };
            let exitCode = null;
            let signal = null;
            child.on("error", (err) => {
                timeoutManager?.clear();
                this.activeProcesses.delete(requestId);
                safeReject(new ProcessSpawnError(request.executable, err.message, requestId));
            });
            // Suppress unhandled error events on child streams (e.g. ENOENT propagation)
            child.stdin?.on("error", () => { });
            child.stdout?.on("error", () => { });
            child.stderr?.on("error", () => { });
            child.stdout?.on("data", (data) => {
                timeoutManager?.signalStarted();
                timeoutManager?.resetIdle();
                try {
                    streams.stdout.push(data);
                }
                catch { }
            });
            child.stderr?.on("data", (data) => {
                timeoutManager?.signalStarted();
                timeoutManager?.resetIdle();
                try {
                    streams.stderr.push(data);
                }
                catch { }
            });
            child.on("close", (code, sig) => {
                exitCode = code;
                signal = sig;
                timeoutManager?.clear();
                this.activeProcesses.delete(requestId);
                this.cancelled.delete(requestId);
                streams.stdout.complete();
                streams.stderr.complete();
                const completedAt = new Date().toISOString();
                const durationMs = Date.now() - startMs;
                const output = {
                    stdout: streams.getStdout(),
                    stderr: streams.getStderr(),
                    stdoutBytes: streams.stdout.totalBytes,
                    stderrBytes: streams.stderr.totalBytes,
                    chunks: streams.getChunks()
                };
                const metrics = {
                    requestId,
                    executable: request.executable,
                    startedAt,
                    completedAt,
                    durationMs,
                    exitCode,
                    signal,
                    stdoutBytes: output.stdoutBytes,
                    stderrBytes: output.stderrBytes,
                    retryCount: 0,
                    timeoutCause: timeoutManager?.trigger?.kind
                };
                // If a timeout fired, propagate it as the primary error
                const timeoutTrigger = timeoutManager?.trigger;
                if (timeoutTrigger) {
                    const elapsedMs = Date.now() - startMs;
                    safeReject(new ProcessTimeoutError(timeoutTrigger.kind, elapsedMs, requestId));
                    return;
                }
                const state = this.cancelled.has(requestId)
                    ? "Cancelled"
                    : exitCode === 0
                        ? "Completed"
                        : "Failed";
                const result = {
                    requestId,
                    state,
                    exitCode,
                    signal,
                    output,
                    metrics
                };
                if (state === "Cancelled") {
                    safeReject(new ProcessCancelledError(requestId));
                }
                else if (exitCode !== 0 && signal === null) {
                    result.error = `Process exited with code ${exitCode}`;
                    safeResolve(result);
                }
                else {
                    safeResolve(result);
                }
            });
            // Arm timeout after everything is set up
            if (timeoutManager) {
                timeoutManager.arm().catch(() => {
                    // Timeout fires safeReject via close handler — no action needed here
                });
            }
        });
    }
    /**
     * Cancel an in-flight process.
     */
    cancel(requestId) {
        this.cancelled.add(requestId);
        const child = this.activeProcesses.get(requestId);
        if (child) {
            try {
                child.kill("SIGINT");
            }
            catch { }
            setTimeout(() => {
                try {
                    child.kill("SIGTERM");
                }
                catch { }
            }, 500);
        }
    }
    /**
     * Kill all active processes — used during shutdown.
     */
    killAll() {
        for (const [id, child] of this.activeProcesses) {
            this.cancelled.add(id);
            try {
                child.kill("SIGTERM");
            }
            catch { }
        }
        this.activeProcesses.clear();
    }
    get activeCount() { return this.activeProcesses.size; }
}
