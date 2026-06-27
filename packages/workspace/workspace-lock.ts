// ──────────────────────────────────────────────────────────────────────────────
// BUILD-048 — Workspace Execution Engine — Lock Manager
// In-memory, deterministic file-level locking. No OS-level locks.
// ──────────────────────────────────────────────────────────────────────────────

import { WorkspaceLock } from "./workspace-types.js";
import { WorkspaceLockError } from "./workspace-errors.js";

export class WorkspaceLockManager {
    /** Canonical path → active lock */
    private readonly locks = new Map<string, WorkspaceLock>();

    /**
     * Acquire exclusive lock on a path for a transaction.
     * Throws WorkspaceLockError if path is already locked by a different transaction.
     * Re-entrant: same transaction can re-acquire without error.
     */
    acquire(filePath: string, transactionId: string): void {
        const existing = this.locks.get(filePath);
        if (existing) {
            if (existing.transactionId === transactionId) {
                // Re-entrant — same transaction, already holds the lock
                return;
            }
            throw new WorkspaceLockError(filePath, existing.transactionId, transactionId);
        }
        this.locks.set(filePath, {
            path: filePath,
            transactionId,
            acquiredAt: new Date().toISOString()
        });
    }

    /**
     * Release a lock held by a transaction.
     * No-op if lock does not exist or belongs to a different transaction.
     */
    release(filePath: string, transactionId: string): void {
        const existing = this.locks.get(filePath);
        if (existing && existing.transactionId === transactionId) {
            this.locks.delete(filePath);
        }
    }

    /**
     * Release ALL locks held by a transaction (used on commit / rollback).
     */
    releaseAll(transactionId: string): void {
        for (const [filePath, lock] of this.locks.entries()) {
            if (lock.transactionId === transactionId) {
                this.locks.delete(filePath);
            }
        }
    }

    isLocked(filePath: string): boolean {
        return this.locks.has(filePath);
    }

    lockedBy(filePath: string): string | undefined {
        return this.locks.get(filePath)?.transactionId;
    }

    /** All currently active locks */
    activeLocks(): WorkspaceLock[] {
        return Array.from(this.locks.values());
    }

    get size(): number {
        return this.locks.size;
    }
}
