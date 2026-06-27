// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — Kernel — Telemetry Service
// Tracks latency, cache hits, plugin utilization, and counts errors centrally.
// ──────────────────────────────────────────────────────────────────────────────
export class TelemetryService {
    metrics = [];
    track(payload) {
        this.metrics.push(payload);
    }
    getMetrics() {
        return [...this.metrics];
    }
    clear() {
        this.metrics.length = 0;
    }
}
