// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050A — Provider Execution Layer — Diagnostics Collector
// Tracks execution metadata per request. No provider-specific fields.
// ──────────────────────────────────────────────────────────────────────────────
export class DiagnosticsCollector {
    records = [];
    activePids = new Set();
    record(metrics, state) {
        this.records.push({ metrics, state });
    }
    trackPid(pid) {
        this.activePids.add(pid);
    }
    untrackPid(pid) {
        this.activePids.delete(pid);
    }
    diagnostics(sandboxPaths = []) {
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
    get totalExecutions() { return this.records.length; }
}
