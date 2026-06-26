// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050A — Provider Execution Layer — Timeout Manager
// Multi-layer timeout: startup → idle → execution → graceful shutdown.
// ──────────────────────────────────────────────────────────────────────────────
import { ProcessTimeoutError } from "./errors";
/**
 * Manages multi-layer timeouts for a single process.
 * Graceful shutdown sequence: SIGINT → SIGTERM → SIGKILL.
 */
export class TimeoutManager {
    policy;
    requestId;
    kill;
    startupTimer;
    idleTimer;
    executionTimer;
    triggered;
    startMs;
    resolve;
    reject;
    killed = false;
    constructor(policy, requestId, kill) {
        this.policy = policy;
        this.requestId = requestId;
        this.kill = kill;
        this.startMs = Date.now();
    }
    /**
     * Arm all timers. Returns a Promise that rejects when any timeout fires.
     * Caller must call .clear() on success.
     */
    arm() {
        return new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
            this.armStartup();
            this.armExecution();
        });
    }
    /**
     * Reset the idle timer (called each time stdout/stderr produces output).
     */
    resetIdle() {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = undefined;
        }
        this.armIdle();
    }
    /** Signal that startup output has been received (clears startup timer). */
    signalStarted() {
        if (this.startupTimer) {
            clearTimeout(this.startupTimer);
            this.startupTimer = undefined;
        }
        this.armIdle();
    }
    /** Clear all timers. Call on normal process completion. */
    clear() {
        if (this.startupTimer)
            clearTimeout(this.startupTimer);
        if (this.idleTimer)
            clearTimeout(this.idleTimer);
        if (this.executionTimer)
            clearTimeout(this.executionTimer);
        this.startupTimer = undefined;
        this.idleTimer = undefined;
        this.executionTimer = undefined;
        this.resolve?.();
    }
    get wasTriggered() { return this.triggered !== undefined; }
    get trigger() { return this.triggered; }
    // ─── Internal ──────────────────────────────────────────────────────────
    armStartup() {
        if (!this.policy.startupTimeoutMs)
            return;
        this.startupTimer = setTimeout(() => {
            this.fire("startup");
        }, this.policy.startupTimeoutMs);
    }
    armIdle() {
        if (!this.policy.idleTimeoutMs)
            return;
        this.idleTimer = setTimeout(() => {
            this.fire("idle");
        }, this.policy.idleTimeoutMs);
    }
    armExecution() {
        if (!this.policy.executionTimeoutMs)
            return;
        this.executionTimer = setTimeout(() => {
            this.fire("execution");
        }, this.policy.executionTimeoutMs);
    }
    fire(kind) {
        if (this.killed)
            return;
        this.killed = true;
        this.clear();
        const elapsedMs = Date.now() - this.startMs;
        this.triggered = { kind, elapsedMs };
        // Graceful shutdown sequence
        this.gracefulKill();
        this.reject?.(new ProcessTimeoutError(kind, elapsedMs, this.requestId));
    }
    gracefulKill() {
        const gracefulMs = this.policy.gracefulShutdownMs ?? 2000;
        const forceKillMs = this.policy.forceKillMs ?? 5000;
        try {
            this.kill("SIGINT");
        }
        catch { }
        setTimeout(() => {
            try {
                this.kill("SIGTERM");
            }
            catch { }
        }, gracefulMs);
        setTimeout(() => {
            try {
                this.kill("SIGKILL");
            }
            catch { }
        }, gracefulMs + forceKillMs);
    }
}
