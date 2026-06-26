// ──────────────────────────────────────────────────────────────────────────────
// BUILD-049 — Provider Runtime — Session Manager
// Persists provider sessions under .brain/providers/sessions/
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { ProviderSession, SessionCheckpoint, SessionStatus } from "./types";
import { ProviderSessionError } from "./errors";

export class SessionManager {
    private readonly sessionsRoot: string;
    /** In-memory map of sessionId → ProviderSession */
    private readonly sessions = new Map<string, ProviderSession>();

    constructor(workspaceRoot: string) {
        this.sessionsRoot = path.join(workspaceRoot, ".brain", "providers", "sessions");
        this.ensureDirectory(this.sessionsRoot);
    }

    /**
     * Create a new session for a provider.
     */
    create(providerId: string, metadata?: Record<string, any>): ProviderSession {
        const id = `session-${providerId}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
        const now = new Date().toISOString();

        const session: ProviderSession = {
            id,
            providerId,
            createdAt: now,
            lastActiveAt: now,
            status: "active",
            checkpoints: [],
            metadata
        };

        this.sessions.set(id, session);
        this.persist(session);
        return session;
    }

    /**
     * Resume a session by ID. Loads from disk if not in memory.
     */
    resume(sessionId: string): ProviderSession {
        if (this.sessions.has(sessionId)) {
            const session = this.sessions.get(sessionId)!;
            session.lastActiveAt = new Date().toISOString();
            session.status = "active";
            this.persist(session);
            return session;
        }

        // Try loading from disk
        const loaded = this.loadFromDisk(sessionId);
        if (!loaded) {
            throw new ProviderSessionError(sessionId, "Session not found on disk or in memory");
        }

        loaded.lastActiveAt = new Date().toISOString();
        loaded.status = "active";
        this.sessions.set(sessionId, loaded);
        this.persist(loaded);
        return loaded;
    }

    /**
     * Add a checkpoint to an existing session.
     */
    checkpoint(sessionId: string, taskId: string, state: Record<string, any>): SessionCheckpoint {
        const session = this.requireSession(sessionId);

        const cp: SessionCheckpoint = {
            id: `cp-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`,
            timestamp: new Date().toISOString(),
            taskId,
            state
        };

        session.checkpoints.push(cp);
        session.lastActiveAt = new Date().toISOString();
        this.persist(session);
        return cp;
    }

    /**
     * Reset all checkpoints in a session.
     */
    reset(sessionId: string): void {
        const session = this.requireSession(sessionId);
        session.checkpoints = [];
        session.lastActiveAt = new Date().toISOString();
        this.persist(session);
    }

    /**
     * Replay session checkpoints in creation order.
     */
    replay(sessionId: string): SessionCheckpoint[] {
        const session = this.requireSession(sessionId);
        return [...session.checkpoints].sort((a, b) =>
            a.timestamp.localeCompare(b.timestamp)
        );
    }

    /**
     * List all sessions for a given provider.
     */
    list(providerId: string): ProviderSession[] {
        return Array.from(this.sessions.values())
            .filter(s => s.providerId === providerId)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }

    /**
     * Mark a session as completed.
     */
    complete(sessionId: string): void {
        const session = this.requireSession(sessionId);
        session.status = "completed";
        session.lastActiveAt = new Date().toISOString();
        this.persist(session);
    }

    /**
     * Get session by ID (in-memory only).
     */
    get(sessionId: string): ProviderSession | undefined {
        return this.sessions.get(sessionId);
    }

    /** Total sessions in memory. */
    get size(): number {
        return this.sessions.size;
    }

    // ─── Persistence ────────────────────────────────────────────────────────

    private persist(session: ProviderSession): void {
        try {
            const dir = path.join(this.sessionsRoot, session.providerId);
            this.ensureDirectory(dir);
            const file = path.join(dir, `${session.id}.json`);
            fs.writeFileSync(file, JSON.stringify(session, null, 2));
        } catch (err: any) {
            // Non-fatal — in-memory state still valid
        }
    }

    private loadFromDisk(sessionId: string): ProviderSession | null {
        try {
            // Search all provider subdirectories
            if (!fs.existsSync(this.sessionsRoot)) return null;
            const providers = fs.readdirSync(this.sessionsRoot);
            for (const providerId of providers) {
                const file = path.join(this.sessionsRoot, providerId, `${sessionId}.json`);
                if (fs.existsSync(file)) {
                    const raw = fs.readFileSync(file, "utf-8");
                    return JSON.parse(raw) as ProviderSession;
                }
            }
        } catch {}
        return null;
    }

    private requireSession(sessionId: string): ProviderSession {
        if (!this.sessions.has(sessionId)) {
            throw new ProviderSessionError(sessionId, "Session not found in memory");
        }
        return this.sessions.get(sessionId)!;
    }

    private ensureDirectory(dir: string): void {
        try {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        } catch {}
    }
}
