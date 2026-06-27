// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Session Store
// JSONL storage at ~/.project-brain/sessions/YYYY-MM-DD.jsonl
// One record per line; append-only.
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { SessionStoreError } from "./errors.js";
import { GlobalPaths } from "./global-paths.js";
export class GatewaySessionStore {
    paths;
    constructor(paths) {
        this.paths = paths ?? new GlobalPaths();
    }
    // ── Helpers ───────────────────────────────────────────────────────────────
    /** Generate a new session id. Format: gs-<8 hex chars> */
    static newId() {
        return `gs-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    }
    // ── Write ─────────────────────────────────────────────────────────────────
    /**
     * Persist a session record.
     * Creates the sessions directory if it does not exist.
     */
    save(session) {
        try {
            fs.mkdirSync(this.paths.sessionsDir, { recursive: true });
            const file = this.paths.sessionFile(new Date(session.startedAt));
            const line = JSON.stringify(session) + "\n";
            fs.appendFileSync(file, line, "utf8");
        }
        catch (err) {
            throw new SessionStoreError(`Failed to save session ${session.id}: ${err.message}`);
        }
    }
    // ── Read ──────────────────────────────────────────────────────────────────
    /**
     * Load all sessions from a specific date file.
     * Returns an empty array if the file does not exist.
     */
    loadDay(date = new Date()) {
        const file = this.paths.sessionFile(date);
        if (!fs.existsSync(file))
            return [];
        try {
            const raw = fs.readFileSync(file, "utf8");
            return raw
                .split("\n")
                .filter(l => l.trim().length > 0)
                .map(l => JSON.parse(l));
        }
        catch (err) {
            throw new SessionStoreError(`Failed to read sessions for ${date.toISOString().slice(0, 10)}: ${err.message}`);
        }
    }
    /**
     * Load all sessions across all stored day files.
     * Returns sessions in reverse-chronological order (newest first).
     */
    listAll(limit) {
        if (!fs.existsSync(this.paths.sessionsDir))
            return [];
        const files = fs
            .readdirSync(this.paths.sessionsDir)
            .filter(f => f.endsWith(".jsonl"))
            .sort()
            .reverse(); // newest first
        const results = [];
        for (const file of files) {
            if (limit !== undefined && results.length >= limit)
                break;
            try {
                const raw = fs.readFileSync(path.join(this.paths.sessionsDir, file), "utf8");
                const sessions = raw
                    .split("\n")
                    .filter(l => l.trim().length > 0)
                    .map(l => JSON.parse(l))
                    .reverse(); // newest within day first
                for (const s of sessions) {
                    if (limit !== undefined && results.length >= limit)
                        break;
                    results.push(s);
                }
            }
            catch {
                // Skip corrupted day files — don't crash the whole list
            }
        }
        return results;
    }
    /**
     * Find a session by id. Searches recent days first.
     * Returns undefined if not found.
     */
    findById(id) {
        if (!fs.existsSync(this.paths.sessionsDir))
            return undefined;
        const files = fs
            .readdirSync(this.paths.sessionsDir)
            .filter(f => f.endsWith(".jsonl"))
            .sort()
            .reverse();
        for (const file of files) {
            try {
                const raw = fs.readFileSync(path.join(this.paths.sessionsDir, file), "utf8");
                const session = raw
                    .split("\n")
                    .filter(l => l.trim().length > 0)
                    .map(l => JSON.parse(l))
                    .find(s => s.id === id);
                if (session)
                    return session;
            }
            catch {
                // Skip corrupted files
            }
        }
        return undefined;
    }
    /**
     * Filter sessions by provider id.
     */
    findByProvider(providerId, limit) {
        return this.listAll(limit ? limit * 5 : undefined)
            .filter(s => s.providerId === providerId)
            .slice(0, limit);
    }
    /**
     * Filter sessions by outcome.
     */
    findByOutcome(outcome, limit) {
        return this.listAll()
            .filter(s => s.outcome === outcome)
            .slice(0, limit);
    }
}
