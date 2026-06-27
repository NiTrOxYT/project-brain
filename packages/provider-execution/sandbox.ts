// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050A — Provider Execution Layer — Execution Sandbox
// Provides isolated, temporary working directories.
// NEVER writes project files. Workspace Engine owns repository modifications.
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import os from "os";
import { SandboxError } from "./errors.js";

export interface SandboxOptions {
    /** Base directory under which sandboxes are created */
    baseDir?: string;
    /** Prefix for the temp directory name */
    prefix?: string;
    /** Environment variables to inject into the sandbox process */
    env?: Record<string, string>;
}

export interface SandboxContext {
    id: string;
    dir: string;
    createdAt: string;
    isClean: boolean;
}

/**
 * Manages isolated temporary execution directories.
 * Each sandbox is a unique temp directory that is cleaned up after use.
 *
 * Invariant: sandboxes NEVER contain project source files.
 * Workspace Engine is the sole writer of repository content.
 */
export class ExecutionSandbox {
    private readonly sandboxes = new Map<string, SandboxContext>();
    private readonly baseDir: string;
    private readonly prefix: string;

    constructor(options: SandboxOptions = {}) {
        this.baseDir = options.baseDir ?? os.tmpdir();
        this.prefix = options.prefix ?? "brain-exec-";
    }

    /**
     * Create a new isolated sandbox directory.
     * Returns the sandbox context including its path.
     */
    create(requestId: string): SandboxContext {
        let dir: string;
        try {
            dir = fs.mkdtempSync(path.join(this.baseDir, `${this.prefix}${requestId.slice(0, 8)}-`));
        } catch (err: any) {
            throw new SandboxError(`Cannot create sandbox directory: ${err.message}`, requestId);
        }

        const ctx: SandboxContext = {
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
    markDirty(requestId: string): void {
        const ctx = this.sandboxes.get(requestId);
        if (ctx) ctx.isClean = false;
    }

    /**
     * Clean up and remove a sandbox directory.
     * Safe to call multiple times.
     */
    cleanup(requestId: string): void {
        const ctx = this.sandboxes.get(requestId);
        if (!ctx) return;

        try {
            if (fs.existsSync(ctx.dir)) {
                fs.rmSync(ctx.dir, { recursive: true, force: true });
            }
        } catch {
            // Best-effort cleanup
        }

        this.sandboxes.delete(requestId);
    }

    /**
     * Clean up all active sandboxes.
     */
    cleanupAll(): void {
        for (const requestId of this.sandboxes.keys()) {
            this.cleanup(requestId);
        }
    }

    get(requestId: string): SandboxContext | undefined {
        return this.sandboxes.get(requestId);
    }

    get activeSandboxCount(): number {
        return this.sandboxes.size;
    }

    get activeSandboxPaths(): string[] {
        return Array.from(this.sandboxes.values()).map(s => s.dir);
    }
}
