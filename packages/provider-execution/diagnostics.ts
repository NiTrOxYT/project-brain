// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050A — Provider Execution Layer — Diagnostics Collector
// Tracks execution metadata per request. No provider-specific fields.
// ──────────────────────────────────────────────────────────────────────────────

import { ExecutionMetrics, ExecutionDiagnostics } from "./types";

interface MetricsRecord {
    metrics: ExecutionMetrics;
    state: "success" | "failed" | "cancelled" | "timeout";
}

export class DiagnosticsCollector {
    private readonly records: MetricsRecord[] = [];
    private readonly activePids = new Set<number>();

    record(metrics: ExecutionMetrics, state: MetricsRecord["state"]): void {
        this.records.push({ metrics, state });
    }

    trackPid(pid: number): void {
        this.activePids.add(pid);
    }

    untrackPid(pid: number): void {
        this.activePids.delete(pid);
    }

    diagnostics(sandboxPaths: string[] = []): ExecutionDiagnostics {
        const total = this.records.length;
        const successful = this.records.filter(r => r.state === "success").length;
        const failed = this.records.filter(r => r.state === "failed").length;
        const cancelled = this.records.filter(r => r.state === "cancelled").length;
        const totalRetries = this.records.reduce((s, r) => s + r.metrics.retryCount, 0);
        const totalTimeouts = this.records.filter(r => r.state === "timeout").length;

        const durations = this.records.map(r => r.metrics.durationMs);
        const avgDuration = durations.length > 0
            ? parseFloat((durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2))
            : 0;

        return {
            totalExecutions: total,
            successfulExecutions: successful,
            failedExecutions: failed,
            cancelledExecutions: cancelled,
            totalRetries,
            totalTimeouts,
            averageDurationMs: avgDuration,
            activePids: Array.from(this.activePids),
            sandboxDirectories: sandboxPaths
        };
    }

    get totalExecutions(): number { return this.records.length; }
}
