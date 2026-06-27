// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — Kernel — Telemetry Service
// Tracks latency, cache hits, plugin utilization, and counts errors centrally.
// ──────────────────────────────────────────────────────────────────────────────

export interface MetricPayload {
    readonly name:   string;
    readonly value:  number;
    readonly tags?:  Readonly<Record<string, string>>;
}

export class TelemetryService {
    private readonly metrics: MetricPayload[] = [];

    track(payload: MetricPayload): void {
        this.metrics.push(payload);
    }

    getMetrics(): MetricPayload[] {
        return [...this.metrics];
    }

    clear(): void {
        this.metrics.length = 0;
    }
}
