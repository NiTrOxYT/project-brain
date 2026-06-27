// ──────────────────────────────────────────────────────────────────────────────
// BUILD-048 — Workspace Execution Engine — Core Engine
// Atomic transactions over the local filesystem.
// Provider-agnostic. Integrates with AgentRuntime via RuntimeArtifact[].
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import EventEmitter from "events";
import path from "path";
import crypto from "crypto";
import { StoragePaths } from "../kernel/paths.js";
import {
    WorkspaceOperation,
    WorkspaceTransaction,
    WorkspaceChange,
    WorkspacePatch,
    WorkspaceValidationResult,
    WorkspaceEngineResult,
    WorkspaceEngineOptions,
    WorkspaceEngineDiagnostics,
    TransactionStatus
} from "./workspace-types.js";
import {
    WorkspaceEngineError,
    WorkspaceTransactionError,
    WorkspaceLockError
} from "./workspace-errors.js";
import { WorkspaceJournal } from "./workspace-journal.js";
import { WorkspaceLockManager } from "./workspace-lock.js";
import { WorkspacePatchEngine } from "./workspace-patch.js";

// Minimal RuntimeArtifact interface — mirrors agent-runtime without importing it
// (keeps workspace-engine provider-agnostic and avoids circular deps)
export interface ApplicableArtifact {
    id: string;
    taskId: string;
    type: string;
    path?: string;
    content: string;
    metadata?: Record<string, any>;
}

// ─── Staged state per transaction ─────────────────────────────────────────────

interface StagedTransaction {
    tx: WorkspaceTransaction;
    /** path → original content before first modification (for rollback) */
    backups: Map<string, string | null>; // null = file did not exist
    /** Accumulated changes so far */
    changes: WorkspaceChange[];
    /** Patches generated during staging */
    patches: WorkspacePatch[];
    /** Validations run during staging */
    validations: WorkspaceValidationResult[];
    /** Locked paths held by this transaction */
    lockedPaths: Set<string>;
}

function generateTxId(): string {
    return `tx-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

// ─── WorkspaceEngine ──────────────────────────────────────────────────────────

export interface WorkspaceChangedEvent {
    transactionId: string;
    workspaceRoot: string;
    affectedFiles: { path: string; operation: string; oldPath?: string }[];
    timestamp: string;
}

export class WorkspaceEngine {
    /** Static event bus — emit 'WorkspaceChangedEvent' after successful commits. */
    static readonly emitter = new EventEmitter();
    private readonly journal: WorkspaceJournal;
    private readonly locks: WorkspaceLockManager;
    private readonly patcher: WorkspacePatchEngine;
    private readonly staged = new Map<string, StagedTransaction>();
    private readonly stateDir: string;
    private readonly options: Required<WorkspaceEngineOptions>;

    // Cumulative diagnostics
    private totalTransactions = 0;
    private committedTransactions = 0;
    private rolledBackTransactions = 0;
    private totalPatchesApplied = 0;
    private totalArtifactsApplied = 0;
    private totalChanges = 0;

    constructor(options: WorkspaceEngineOptions) {
        this.options = {
            stateDirectory: "journal",
            maxConcurrentTransactions: 8,
            dryRun: false,
            rollbackOnError: true,
            ...options
        };

        const paths = new StoragePaths(this.options.workspaceRoot);
        this.stateDir = paths.journalDir;

        this.ensureStateDirectory();
        this.journal = new WorkspaceJournal(this.stateDir);
        this.locks = new WorkspaceLockManager();
        this.patcher = new WorkspacePatchEngine();
    }

    // ─── Public API ─────────────────────────────────────────────────────────

    /**
     * Begin a new atomic transaction. Returns the transaction object.
     * All operations must be staged within a transaction before committing.
     */
    beginTransaction(): WorkspaceTransaction {
        if (this.staged.size >= this.options.maxConcurrentTransactions) {
            throw new WorkspaceEngineError(
                `Maximum concurrent transactions (${this.options.maxConcurrentTransactions}) reached.`
            );
        }

        const tx: WorkspaceTransaction = {
            id: generateTxId(),
            status: "pending",
            operations: [],
            createdAt: new Date().toISOString(),
            journal: []
        };

        this.staged.set(tx.id, {
            tx,
            backups: new Map(),
            changes: [],
            patches: [],
            validations: [],
            lockedPaths: new Set()
        });

        this.totalTransactions++;
        this.journal.record(tx.id, "begin", { details: { transactionId: tx.id } });
        return tx;
    }

    /**
     * Stage an operation within a transaction.
     * Acquires file locks; does NOT write to disk yet.
     */
    stage(transactionId: string, operation: WorkspaceOperation): void {
        const staged = this.requireStaged(transactionId, "stage");
        staged.tx.operations.push(operation);
        staged.tx.status = "staged";

        // Acquire locks for paths involved
        const paths = this.pathsForOperation(operation);
        for (const p of paths) {
            try {
                this.locks.acquire(p, transactionId);
                staged.lockedPaths.add(p);
            } catch (err) {
                if (err instanceof WorkspaceLockError) throw err;
                throw new WorkspaceTransactionError(transactionId, `Lock acquisition failed: ${err}`);
            }
        }

        this.journal.record(transactionId, "stage", {
            path: this.primaryPath(operation),
            details: { kind: operation.kind }
        });
    }

    /**
     * Preview all staged operations as patches without committing.
     * Returns generated patches (dry-run safe).
     */
    preview(transactionId: string): WorkspacePatch[] {
        const staged = this.requireStaged(transactionId, "preview");
        const patches: WorkspacePatch[] = [];

        for (const op of staged.tx.operations) {
            if (op.kind === "WriteFile") {
                const absPath = this.resolve(op.path);
                const existing = this.safeReadFile(absPath);
                if (existing !== null && existing !== op.content) {
                    const patch = this.patcher.generatePatch(absPath, existing, op.content);
                    patches.push(patch);
                } else if (existing === null) {
                    // New file — generate a patch showing full addition
                    const patch = this.patcher.generatePatch(op.path, "", op.content);
                    patches.push(patch);
                }
            } else if (op.kind === "PatchFile") {
                patches.push(op.patch);
            }
        }

        return patches;
    }

    /**
     * Commit all staged operations atomically.
     * On any error: automatically rollback if rollbackOnError=true.
     */
    async commit(transactionId: string): Promise<WorkspaceEngineResult> {
        const staged = this.requireStaged(transactionId, "commit");
        const startTime = Date.now();

        // Enforce Shared Memory validation rules: consensus reached, conflicts resolved
        try {
            const { SharedMemoryService } = await import("../shared-memory/index.js");
            const sharedMem = new SharedMemoryService(this.options.workspaceRoot, this.options.workspaceRoot);
            await sharedMem.restoreLatest().catch(() => {});
            
            const conflicts = sharedMem.detectConflicts();
            if (conflicts.some(c => c.status === "open")) {
                throw new Error("Cannot commit transaction: Open unresolved conflicts exist in Shared Memory.");
            }

            const state = (sharedMem as any).model.getState();
            const openProposals = state.proposals.filter((p: any) => p.status === "propose" || p.status === "review" || p.status === "reject");
            if (openProposals.length > 0) {
                throw new Error("Cannot commit transaction: Consensus not reached or proposals rejected/unfinalized.");
            }
        } catch (err: any) {
            if (err.message.includes("Cannot commit transaction")) {
                throw new WorkspaceTransactionError(err.message, transactionId);
            }
        }

        this.journal.record(transactionId, "commit", { details: { operationCount: staged.tx.operations.length } });

        try {
            for (const op of staged.tx.operations) {
                await this.applyOperation(staged, op);
            }

            staged.tx.status = "committed";
            staged.tx.committedAt = new Date().toISOString();
            this.locks.releaseAll(transactionId);
            this.staged.delete(transactionId);
            this.committedTransactions++;
            this.totalChanges += staged.changes.length;
            this.totalPatchesApplied += staged.patches.length;

            const result = this.buildResult(transactionId, staged, false, undefined, startTime);

            const event: WorkspaceChangedEvent = {
                transactionId,
                workspaceRoot: this.options.workspaceRoot,
                affectedFiles: staged.changes.map(c => ({
                    path: c.path,
                    operation: c.kind,
                    oldPath: c.oldPath
                })),
                timestamp: staged.tx.committedAt!
            };
            WorkspaceEngine.emitter.emit("WorkspaceChangedEvent", event);

            return result;
        } catch (err: any) {
            if (this.options.rollbackOnError) {
                await this.rollbackInternal(transactionId, staged);
            } else {
                staged.tx.status = "failed";
                this.locks.releaseAll(transactionId);
                this.staged.delete(transactionId);
            }
            const result = this.buildResult(transactionId, staged, true, err.message, startTime);
            result.success = false;
            return result;
        }
    }

    /**
     * Explicitly rollback a staged transaction.
     * Restores all files to their pre-staging state.
     */
    async rollback(transactionId: string): Promise<void> {
        const staged = this.requireStaged(transactionId, "rollback");
        await this.rollbackInternal(transactionId, staged);
    }

    /**
     * Main integration point for Agent Runtime.
     * Takes RuntimeArtifact[] and applies them as a single atomic transaction.
     * Only processes artifacts that have a path and content.
     */
    async applyArtifacts(
        artifacts: ApplicableArtifact[],
        existingTransactionId?: string
    ): Promise<WorkspaceEngineResult> {
        const startTime = Date.now();
        const applicable = artifacts.filter(a => a.path && a.content !== undefined);
        this.totalArtifactsApplied += applicable.length;

        if (applicable.length === 0) {
            // Nothing to apply — return empty success
            const emptyTxId = existingTransactionId || generateTxId();
            return {
                transactionId: emptyTxId,
                success: true,
                changes: [],
                patches: [],
                validations: [],
                rolledBack: false,
                durationMs: Date.now() - startTime,
                artifactsApplied: 0
            };
        }

        const tx = existingTransactionId
            ? this.staged.get(existingTransactionId)?.tx || this.beginTransaction()
            : this.beginTransaction();

        const txId = tx.id;

        // Stage a WriteFile for each applicable artifact
        for (const artifact of applicable) {
            this.stage(txId, {
                kind: "WriteFile",
                path: artifact.path!,
                content: artifact.content
            });
        }

        const result = await this.commit(txId);
        result.artifactsApplied = applicable.length;
        return result;
    }

    diagnostics(): WorkspaceEngineDiagnostics {
        return {
            totalTransactions: this.totalTransactions,
            committedTransactions: this.committedTransactions,
            rolledBackTransactions: this.rolledBackTransactions,
            totalPatchesApplied: this.totalPatchesApplied,
            totalArtifactsApplied: this.totalArtifactsApplied,
            totalChanges: this.totalChanges,
            activeLocks: this.locks.size,
            journalEntries: this.journal.size
        };
    }

    // ─── Internal ───────────────────────────────────────────────────────────

    private async applyOperation(staged: StagedTransaction, op: WorkspaceOperation): Promise<void> {
        const txId = staged.tx.id;

        switch (op.kind) {
            case "WriteFile": {
                const absPath = this.resolve(op.path);
                const existing = this.safeReadFile(absPath);
                this.backup(staged, absPath, existing);

                if (!this.patcher.isIdentical(existing ?? "", op.content)) {
                    const patch = this.patcher.generatePatch(absPath, existing ?? "", op.content);
                    staged.patches.push(patch);
                }

                if (!this.options.dryRun) {
                    this.ensureParentDir(absPath);
                    fs.writeFileSync(absPath, op.content, op.encoding || "utf-8");
                }

                this.journal.record(txId, "write", { path: op.path });
                staged.changes.push({ kind: "written", path: op.path, transactionId: txId, timestamp: new Date().toISOString() });
                break;
            }

            case "ReadFile": {
                // Read-only — no backup, no disk write, just validate existence
                const absPath = this.resolve(op.path);
                if (!fs.existsSync(absPath)) {
                    throw new WorkspaceTransactionError(txId, `ReadFile: path '${op.path}' does not exist.`);
                }
                break;
            }

            case "DeleteFile": {
                const absPath = this.resolve(op.path);
                const existing = this.safeReadFile(absPath);
                this.backup(staged, absPath, existing);

                if (!this.options.dryRun && fs.existsSync(absPath)) {
                    fs.unlinkSync(absPath);
                }

                this.journal.record(txId, "delete", { path: op.path });
                staged.changes.push({ kind: "deleted", path: op.path, transactionId: txId, timestamp: new Date().toISOString() });
                break;
            }

            case "RenameFile": {
                const absOld = this.resolve(op.oldPath);
                const absNew = this.resolve(op.newPath);
                const existing = this.safeReadFile(absOld);
                this.backup(staged, absOld, existing);
                this.backup(staged, absNew, null); // mark new path as not originally existing

                if (!this.options.dryRun && fs.existsSync(absOld)) {
                    this.ensureParentDir(absNew);
                    fs.renameSync(absOld, absNew);
                }

                this.journal.record(txId, "rename", { oldPath: op.oldPath, newPath: op.newPath });
                staged.changes.push({
                    kind: "renamed",
                    path: op.newPath,
                    oldPath: op.oldPath,
                    transactionId: txId,
                    timestamp: new Date().toISOString()
                });
                break;
            }

            case "CreateDirectory": {
                const absPath = this.resolve(op.path);
                if (!this.options.dryRun) {
                    fs.mkdirSync(absPath, { recursive: op.recursive ?? true });
                }

                this.journal.record(txId, "mkdir", { path: op.path });
                staged.changes.push({ kind: "created", path: op.path, transactionId: txId, timestamp: new Date().toISOString() });
                break;
            }

            case "DeleteDirectory": {
                const absPath = this.resolve(op.path);
                if (!this.options.dryRun && fs.existsSync(absPath)) {
                    fs.rmSync(absPath, { recursive: op.recursive ?? true, force: true });
                }

                this.journal.record(txId, "rmdir", { path: op.path });
                staged.changes.push({ kind: "deleted", path: op.path, transactionId: txId, timestamp: new Date().toISOString() });
                break;
            }

            case "ValidateFile": {
                const absPath = this.resolve(op.path);
                const exists = fs.existsSync(absPath);
                const validation: WorkspaceValidationResult = { path: op.path, valid: true, exists };

                if (op.exists !== undefined && exists !== op.exists) {
                    validation.valid = false;
                    validation.error = op.exists
                        ? `Expected file to exist: '${op.path}'`
                        : `Expected file to not exist: '${op.path}'`;
                }

                if (op.expectedContent !== undefined && exists) {
                    const actual = fs.readFileSync(absPath, "utf-8");
                    const match = actual === op.expectedContent;
                    validation.contentMatch = match;
                    if (!match) {
                        validation.valid = false;
                        validation.error = `Content mismatch for '${op.path}'`;
                    }
                }

                staged.validations.push(validation);
                this.journal.record(txId, "validate", { path: op.path, details: { valid: validation.valid } });

                if (!validation.valid) {
                    throw new WorkspaceTransactionError(txId, validation.error || `Validation failed: '${op.path}'`);
                }
                break;
            }

            case "PatchFile": {
                const absPath = this.resolve(op.patch.path);
                const existing = this.safeReadFile(absPath);
                this.backup(staged, absPath, existing);

                const newContent = this.patcher.applyPatch(op.patch);
                staged.patches.push(op.patch);

                if (!this.options.dryRun) {
                    this.ensureParentDir(absPath);
                    fs.writeFileSync(absPath, newContent, "utf-8");
                }

                this.journal.record(txId, "patch", { path: op.patch.path });
                staged.changes.push({ kind: "patched", path: op.patch.path, transactionId: txId, timestamp: new Date().toISOString(), patch: op.patch });
                break;
            }
        }
    }

    private async rollbackInternal(transactionId: string, staged: StagedTransaction): Promise<void> {
        this.journal.record(transactionId, "rollback", { details: { backupCount: staged.backups.size } });

        // Restore all backed-up files in reverse order
        const backupEntries = Array.from(staged.backups.entries()).reverse();
        for (const [absPath, originalContent] of backupEntries) {
            try {
                if (!this.options.dryRun) {
                    if (originalContent === null) {
                        // File didn't exist — remove it if it was created
                        if (fs.existsSync(absPath)) {
                            fs.unlinkSync(absPath);
                        }
                    } else {
                        // Restore original content
                        this.ensureParentDir(absPath);
                        fs.writeFileSync(absPath, originalContent, "utf-8");
                        this.journal.record(transactionId, "restore", { path: absPath });
                    }
                }
            } catch (err: any) {
                this.journal.record(transactionId, "error", {
                    path: absPath,
                    error: `Rollback restore failed: ${err.message}`
                });
            }
        }

        staged.tx.status = "rolledBack";
        staged.tx.rolledBackAt = new Date().toISOString();
        this.locks.releaseAll(transactionId);
        this.staged.delete(transactionId);
        this.rolledBackTransactions++;
    }

    private buildResult(
        transactionId: string,
        staged: StagedTransaction,
        rolledBack: boolean,
        error: string | undefined,
        startTime: number
    ): WorkspaceEngineResult {
        return {
            transactionId,
            success: !rolledBack && !error,
            changes: staged.changes,
            patches: staged.patches,
            validations: staged.validations,
            rolledBack,
            error,
            durationMs: Date.now() - startTime,
            artifactsApplied: 0
        };
    }

    private requireStaged(transactionId: string, operation: string): StagedTransaction {
        const staged = this.staged.get(transactionId);
        if (!staged) {
            throw new WorkspaceTransactionError(transactionId, `Cannot '${operation}': transaction not found or already completed.`);
        }
        return staged;
    }

    private backup(staged: StagedTransaction, absPath: string, content: string | null): void {
        // Only backup on first write to this path
        if (!staged.backups.has(absPath)) {
            staged.backups.set(absPath, content);
        }
    }

    private safeReadFile(absPath: string): string | null {
        try {
            if (fs.existsSync(absPath)) {
                return fs.readFileSync(absPath, "utf-8");
            }
        } catch {}
        return null;
    }

    private resolve(relativePath: string): string {
        if (path.isAbsolute(relativePath)) return relativePath;
        return path.resolve(this.options.workspaceRoot, relativePath);
    }

    private ensureParentDir(absPath: string): void {
        const dir = path.dirname(absPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    private ensureStateDirectory(): void {
        try {
            if (!fs.existsSync(this.stateDir)) {
                fs.mkdirSync(this.stateDir, { recursive: true });
            }
        } catch {}
    }

    private pathsForOperation(op: WorkspaceOperation): string[] {
        const resolve = (p: string) => this.resolve(p);
        switch (op.kind) {
            case "WriteFile":
            case "ReadFile":
            case "DeleteFile":
            case "CreateDirectory":
            case "DeleteDirectory":
            case "ValidateFile":
                return [resolve(op.path)];
            case "RenameFile":
                return [resolve(op.oldPath), resolve(op.newPath)];
            case "PatchFile":
                return [resolve(op.patch.path)];
            default:
                return [];
        }
    }

    private primaryPath(op: WorkspaceOperation): string | undefined {
        switch (op.kind) {
            case "WriteFile":
            case "ReadFile":
            case "DeleteFile":
            case "CreateDirectory":
            case "DeleteDirectory":
            case "ValidateFile":
                return op.path;
            case "RenameFile":
                return op.oldPath;
            case "PatchFile":
                return op.patch.path;
            default:
                return undefined;
        }
    }
}
