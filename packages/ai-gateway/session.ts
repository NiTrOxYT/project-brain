// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Session Store
// JSONL storage at ~/.project-brain/sessions/YYYY-MM-DD.jsonl
// One record per line; append-only.
// ──────────────────────────────────────────────────────────────────────────────

import fs   from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { GatewaySession, SessionOutcome } from "./types.js";
import { SessionStoreError } from "./errors.js";
import { GlobalPaths } from "./global-paths.js";

export class GatewaySessionStore {
    private readonly paths: GlobalPaths;

    constructor(paths?: GlobalPaths) {
        this.paths = paths ?? new GlobalPaths();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Generate a new session id. Format: gs-<8 hex chars> */
    static newId(): string {
        return `gs-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    }

    // ── Write ─────────────────────────────────────────────────────────────────

    /**
     * Persist a session record.
     * Creates the sessions directory if it does not exist.
     */
    save(session: GatewaySession): void {
        try {
            fs.mkdirSync(this.paths.sessionsDir, { recursive: true });
            const file = this.paths.sessionFile(new Date(session.startedAt));
            const line = JSON.stringify(session) + "\n";
            fs.appendFileSync(file, line, "utf8");
        } catch (err) {
            throw new SessionStoreError(
                `Failed to save session ${session.id}: ${(err as Error).message}`
            );
        }
    }

    // ── Read ──────────────────────────────────────────────────────────────────

    /**
     * Load all sessions from a specific date file.
     * Returns an empty array if the file does not exist.
     */
    loadDay(date: Date = new Date()): GatewaySession[] {
        const file = this.paths.sessionFile(date);
        if (!fs.existsSync(file)) return [];
        try {
            const raw = fs.readFileSync(file, "utf8");
            return raw
                .split("\n")
                .filter(l => l.trim().length > 0)
                .map(l => JSON.parse(l) as GatewaySession);
        } catch (err) {
            throw new SessionStoreError(
                `Failed to read sessions for ${date.toISOString().slice(0, 10)}: ${(err as Error).message}`
            );
        }
    }

    /**
     * Load all sessions across all stored day files.
     * Returns sessions in reverse-chronological order (newest first).
     */
    listAll(limit?: number): GatewaySession[] {
        if (!fs.existsSync(this.paths.sessionsDir)) return [];

        const files = fs
            .readdirSync(this.paths.sessionsDir)
            .filter(f => f.endsWith(".jsonl"))
            .sort()
            .reverse(); // newest first

        const results: GatewaySession[] = [];

        for (const file of files) {
            if (limit !== undefined && results.length >= limit) break;
            try {
                const raw = fs.readFileSync(
                    path.join(this.paths.sessionsDir, file),
                    "utf8"
                );
                const sessions = raw
                    .split("\n")
                    .filter(l => l.trim().length > 0)
                    .map(l => JSON.parse(l) as GatewaySession)
                    .reverse(); // newest within day first

                for (const s of sessions) {
                    if (limit !== undefined && results.length >= limit) break;
                    results.push(s);
                }
            } catch {
                // Skip corrupted day files — don't crash the whole list
            }
        }

        return results;
    }

    /**
     * Find a session by id. Searches recent days first.
     * Returns undefined if not found.
     */
    findById(id: string): GatewaySession | undefined {
        if (!fs.existsSync(this.paths.sessionsDir)) return undefined;

        const files = fs
            .readdirSync(this.paths.sessionsDir)
            .filter(f => f.endsWith(".jsonl"))
            .sort()
            .reverse();

        for (const file of files) {
            try {
                const raw = fs.readFileSync(
                    path.join(this.paths.sessionsDir, file),
                    "utf8"
                );
                const session = raw
                    .split("\n")
                    .filter(l => l.trim().length > 0)
                    .map(l => JSON.parse(l) as GatewaySession)
                    .find(s => s.id === id);
                if (session) return session;
            } catch {
                // Skip corrupted files
            }
        }

        return undefined;
    }

    /**
     * Filter sessions by provider id.
     */
    findByProvider(providerId: string, limit?: number): GatewaySession[] {
        return this.listAll(limit ? limit * 5 : undefined)
            .filter(s => s.providerId === providerId)
            .slice(0, limit);
    }

    /**
     * Filter sessions by outcome.
     */
    findByOutcome(outcome: SessionOutcome, limit?: number): GatewaySession[] {
        return this.listAll()
            .filter(s => s.outcome === outcome)
            .slice(0, limit);
    }
}
