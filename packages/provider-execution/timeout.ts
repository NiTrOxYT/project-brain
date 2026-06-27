// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050A — Provider Execution Layer — Timeout Manager
// Multi-layer timeout: startup → idle → execution → graceful shutdown.
// ──────────────────────────────────────────────────────────────────────────────

import { TimeoutPolicy } from "./types.js";
import { ProcessTimeoutError } from "./errors.js";

export type TimeoutKind = "startup" | "idle" | "execution";

export interface TimeoutTrigger {
    kind: TimeoutKind;
    elapsedMs: number;
}

type KillFn = (signal: NodeJS.Signals) => void;

/**
 * Manages multi-layer timeouts for a single process.
 * Graceful shutdown sequence: SIGINT → SIGTERM → SIGKILL.
 */
export class TimeoutManager {
    private startupTimer?: NodeJS.Timeout;
    private idleTimer?: NodeJS.Timeout;
    private executionTimer?: NodeJS.Timeout;
    private triggered: TimeoutTrigger | undefined;
    private readonly startMs: number;
    private resolve?: () => void;
    private reject?: (err: ProcessTimeoutError) => void;
    private killed = false;

    constructor(
        private readonly policy: TimeoutPolicy,
        private readonly requestId: string,
        private readonly kill: KillFn
    ) {
        this.startMs = Date.now();
    }

    /**
     * Arm all timers. Returns a Promise that rejects when any timeout fires.
     * Caller must call .clear() on success.
     */
    arm(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
            this.armStartup();
            this.armExecution();
        });
    }

    /**
     * Reset the idle timer (called each time stdout/stderr produces output).
     */
    resetIdle(): void {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = undefined;
        }
        this.armIdle();
    }

    /** Signal that startup output has been received (clears startup timer). */
    signalStarted(): void {
        if (this.startupTimer) {
            clearTimeout(this.startupTimer);
            this.startupTimer = undefined;
        }
        this.armIdle();
    }

    /** Clear all timers. Call on normal process completion. */
    clear(): void {
        if (this.startupTimer) clearTimeout(this.startupTimer);
        if (this.idleTimer) clearTimeout(this.idleTimer);
        if (this.executionTimer) clearTimeout(this.executionTimer);
        this.startupTimer = undefined;
        this.idleTimer = undefined;
        this.executionTimer = undefined;
        this.resolve?.();
    }

    get wasTriggered(): boolean { return this.triggered !== undefined; }
    get trigger(): TimeoutTrigger | undefined { return this.triggered; }

    // ─── Internal ──────────────────────────────────────────────────────────

    private armStartup(): void {
        if (!this.policy.startupTimeoutMs) return;
        this.startupTimer = setTimeout(() => {
            this.fire("startup");
        }, this.policy.startupTimeoutMs);
    }

    private armIdle(): void {
        if (!this.policy.idleTimeoutMs) return;
        this.idleTimer = setTimeout(() => {
            this.fire("idle");
        }, this.policy.idleTimeoutMs);
    }

    private armExecution(): void {
        if (!this.policy.executionTimeoutMs) return;
        this.executionTimer = setTimeout(() => {
            this.fire("execution");
        }, this.policy.executionTimeoutMs);
    }

    private fire(kind: TimeoutKind): void {
        if (this.killed) return;
        this.killed = true;
        this.clear();

        const elapsedMs = Date.now() - this.startMs;
        this.triggered = { kind, elapsedMs };

        // Graceful shutdown sequence
        this.gracefulKill();

        this.reject?.(new ProcessTimeoutError(kind, elapsedMs, this.requestId));
    }

    private gracefulKill(): void {
        const gracefulMs = this.policy.gracefulShutdownMs ?? 2000;
        const forceKillMs = this.policy.forceKillMs ?? 5000;

        try { this.kill("SIGINT"); } catch { }

        setTimeout(() => {
            try { this.kill("SIGTERM"); } catch { }
        }, gracefulMs);

        setTimeout(() => {
            try { this.kill("SIGKILL"); } catch { }
        }, gracefulMs + forceKillMs);
    }
}
