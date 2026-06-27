// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Timeline Store
// Collects and format TimelineEntry objects from a stream of GatewayEvents.
// ──────────────────────────────────────────────────────────────────────────────
export class TimelineStore {
    sessionId;
    entries = [];
    start = Date.now();
    constructor(sessionId) {
        this.sessionId = sessionId;
    }
    /**
     * Record a new event into the timeline.
     */
    record(event, label, detail) {
        if (event.sessionId !== this.sessionId)
            return;
        const elapsed = Date.now() - this.start;
        const entry = {
            timestamp: event.timestamp,
            elapsed,
            kind: event.kind,
            label,
            detail,
        };
        if (event.payload["durationMs"] != null) {
            entry.durationMs = event.payload["durationMs"];
        }
        this.entries.push(entry);
    }
    /**
     * Complete a pending event by recording its duration.
     */
    complete(kind, durationMs) {
        const entry = this.entries.find(e => e.kind === kind);
        if (entry) {
            entry.durationMs = durationMs;
        }
    }
    /**
     * Get the list of all timeline entries.
     */
    snapshot() {
        return [...this.entries];
    }
    /**
     * Renders the timeline into a formatted human-readable string.
     */
    render() {
        const lines = [`🧠 Project Brain — Session Timeline [${this.sessionId}]`];
        for (const t of this.entries) {
            const timeStr = formatMs(t.elapsed).padStart(8);
            const detailStr = t.detail ? ` (${t.detail})` : "";
            const durationStr = t.durationMs != null ? ` [${t.durationMs}ms]` : "";
            lines.push(`  ${timeStr}  ${t.label}${detailStr}${durationStr}`);
        }
        return lines.join("\n");
    }
}
function formatMs(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    if (mins === 0)
        return `${secs}s`;
    return `${mins}m ${secs % 60}s`;
}
