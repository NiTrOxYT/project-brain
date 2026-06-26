// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050A — Provider Execution Layer — Execution Sandbox
// Provides isolated, temporary working directories.
// NEVER writes project files. Workspace Engine owns repository modifications.
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import os from "os";
import { SandboxError } from "./errors";
/**
 * Manages isolated temporary execution directories.
 * Each sandbox is a unique temp directory that is cleaned up after use.
 *
 * Invariant: sandboxes NEVER contain project source files.
 * Workspace Engine is the sole writer of repository content.
 */
export class ExecutionSandbox {
    sandboxes = new Map();
    baseDir;
    prefix;
    constructor(options = {}) {
        this.baseDir = options.baseDir ?? os.tmpdir();
        this.prefix = options.prefix ?? "brain-exec-";
    }
    /**
     * Create a new isolated sandbox directory.
     * Returns the sandbox context including its path.
     */
    create(requestId) {
        let dir;
        try {
            dir = fs.mkdtempSync(path.join(this.baseDir, `${this.prefix}${requestId.slice(0, 8)}-`));
        }
        catch (err) {
            throw new SandboxError(`Cannot create sandbox directory: ${err.message}`, requestId);
        }
        const ctx = {
            id: requestId,
            dir,
            createdAt: new Date().toISOString(),
            isClean: true
        };
        this.sandboxes.set(requestId, ctx);
        return ctx;
    }
    /**
     * Mark sandbox as dirty (contents modified — for tracking only).
     */
    markDirty(requestId) {
        const ctx = this.sandboxes.get(requestId);
        if (ctx)
            ctx.isClean = false;
    }
    /**
     * Clean up and remove a sandbox directory.
     * Safe to call multiple times.
     */
    cleanup(requestId) {
        const ctx = this.sandboxes.get(requestId);
        if (!ctx)
            return;
        try {
            if (fs.existsSync(ctx.dir)) {
                fs.rmSync(ctx.dir, { recursive: true, force: true });
            }
        }
        catch {
            // Best-effort cleanup
        }
        this.sandboxes.delete(requestId);
    }
    /**
     * Clean up all active sandboxes.
     */
    cleanupAll() {
        for (const requestId of this.sandboxes.keys()) {
            this.cleanup(requestId);
        }
    }
    get(requestId) {
        return this.sandboxes.get(requestId);
    }
    get activeSandboxCount() {
        return this.sandboxes.size;
    }
    get activeSandboxPaths() {
        return Array.from(this.sandboxes.values()).map(s => s.dir);
    }
}
