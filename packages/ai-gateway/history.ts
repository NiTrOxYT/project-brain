// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — History
// Filter, paginate, and render past sessions.
// ──────────────────────────────────────────────────────────────────────────────

import type { GatewaySession } from "./types.js";
import { GatewaySessionStore } from "./session.js";

export interface HistoryFilter {
    providerId?: string;
    keyword?:    string;       // substring match on originalPrompt
    outcome?:    "success" | "failed" | "cancelled";
    since?:      Date;
    until?:      Date;
    limit?:      number;
}

export interface HistoryRow {
    id:          string;
    provider:    string;
    startedAt:   string;
    duration:    string;       // human-readable e.g. "4m 02s"
    reduction:   string;       // e.g. "68%"
    outcome:     string;
    promptSnip:  string;       // first 60 chars of original prompt
}

export class GatewayHistory {
    constructor(private readonly store: GatewaySessionStore) {}

    /**
     * Query sessions with optional filters.
     * Returns sessions in reverse-chronological order.
     */
    query(filter: HistoryFilter = {}): GatewaySession[] {
        const all = this.store.listAll();
        return all
            .filter(s => !filter.providerId || s.providerId === filter.providerId)
            .filter(s => !filter.outcome    || s.outcome    === filter.outcome)
            .filter(s => {
                if (!filter.keyword) return true;
                const kw = filter.keyword.toLowerCase();
                return s.originalPrompt.toLowerCase().includes(kw);
            })
            .filter(s => {
                if (!filter.since) return true;
                return new Date(s.startedAt) >= filter.since;
            })
            .filter(s => {
                if (!filter.until) return true;
                return new Date(s.startedAt) <= filter.until;
            })
            .slice(0, filter.limit ?? 50);
    }

    /**
     * Convert sessions to display rows for table rendering.
     */
    toRows(sessions: GatewaySession[]): HistoryRow[] {
        return sessions.map(s => ({
            id:        s.id,
            provider:  s.providerId,
            startedAt: formatDate(s.startedAt),
            duration:  formatDuration(s.startedAt, s.completedAt),
            reduction: s.metrics ? `${Math.round(s.metrics.reductionPct)}%` : "—",
            outcome:   s.outcome ?? "—",
            promptSnip: s.originalPrompt.slice(0, 60).replace(/\n/g, " ") +
                        (s.originalPrompt.length > 60 ? "…" : ""),
        }));
    }
}

// ─── Formatting helpers ────────────────────────────────────────────────────────

function formatDate(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number): string => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDuration(startedAt: string, completedAt?: string): string {
    if (!completedAt) return "—";
    const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
    if (ms < 0) return "—";
    const secs  = Math.floor(ms / 1000);
    const mins  = Math.floor(secs / 60);
    const rem   = secs % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${String(rem).padStart(2, "0")}s`;
}
