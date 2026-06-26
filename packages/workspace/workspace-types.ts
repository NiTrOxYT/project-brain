// ──────────────────────────────────────────────────────────────────────────────
// BUILD-048 — Workspace Execution Engine — Types
// ──────────────────────────────────────────────────────────────────────────────

// ─── Operations ───────────────────────────────────────────────────────────────

export interface WriteFileOperation {
    kind: "WriteFile";
    path: string;
    content: string;
    encoding?: BufferEncoding;
}

export interface ReadFileOperation {
    kind: "ReadFile";
    path: string;
    encoding?: BufferEncoding;
}

export interface DeleteFileOperation {
    kind: "DeleteFile";
    path: string;
}

export interface RenameFileOperation {
    kind: "RenameFile";
    oldPath: string;
    newPath: string;
}

export interface CreateDirectoryOperation {
    kind: "CreateDirectory";
    path: string;
    recursive?: boolean;
}

export interface DeleteDirectoryOperation {
    kind: "DeleteDirectory";
    path: string;
    recursive?: boolean;
}

export interface ValidateFileOperation {
    kind: "ValidateFile";
    path: string;
    expectedContent?: string;
    exists?: boolean;
}

export interface PatchFileOperation {
    kind: "PatchFile";
    path: string;
    patch: WorkspacePatch;
}

export type WorkspaceOperation =
    | WriteFileOperation
    | ReadFileOperation
    | DeleteFileOperation
    | RenameFileOperation
    | CreateDirectoryOperation
    | DeleteDirectoryOperation
    | ValidateFileOperation
    | PatchFileOperation;

// ─── Patch ────────────────────────────────────────────────────────────────────

export interface WorkspacePatch {
    path: string;
    originalContent: string;
    newContent: string;
    hunks: PatchHunk[];
    createdAt: string;
    provider?: string;
}

export interface PatchHunk {
    startLine: number;
    removedLines: string[];
    addedLines: string[];
}

// ─── Journal ──────────────────────────────────────────────────────────────────

export type WorkspaceJournalAction =
    | "begin"
    | "stage"
    | "write"
    | "delete"
    | "rename"
    | "mkdir"
    | "rmdir"
    | "patch"
    | "validate"
    | "commit"
    | "rollback"
    | "restore"
    | "error";

export interface WorkspaceJournalEntry {
    transactionId: string;
    action: WorkspaceJournalAction;
    path?: string;
    oldPath?: string;
    newPath?: string;
    timestamp: string;
    details?: Record<string, any>;
    error?: string;
}

// ─── Lock ─────────────────────────────────────────────────────────────────────

export interface WorkspaceLock {
    path: string;
    transactionId: string;
    acquiredAt: string;
}

// ─── Transaction ──────────────────────────────────────────────────────────────

export type TransactionStatus =
    | "pending"
    | "staged"
    | "committed"
    | "rolledBack"
    | "failed";

export interface WorkspaceTransaction {
    id: string;
    status: TransactionStatus;
    operations: WorkspaceOperation[];
    createdAt: string;
    committedAt?: string;
    rolledBackAt?: string;
    journal: WorkspaceJournalEntry[];
}

// ─── Change Record ────────────────────────────────────────────────────────────

export type ChangeKind = "written" | "deleted" | "renamed" | "created" | "patched" | "validated";

export interface WorkspaceChange {
    kind: ChangeKind;
    path: string;
    oldPath?: string;
    transactionId: string;
    timestamp: string;
    patch?: WorkspacePatch;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface WorkspaceValidationResult {
    path: string;
    valid: boolean;
    exists: boolean;
    contentMatch?: boolean;
    error?: string;
}

// ─── Engine Result ────────────────────────────────────────────────────────────

export interface WorkspaceEngineResult {
    transactionId: string;
    success: boolean;
    changes: WorkspaceChange[];
    patches: WorkspacePatch[];
    validations: WorkspaceValidationResult[];
    rolledBack: boolean;
    error?: string;
    durationMs: number;
    artifactsApplied: number;
}

// ─── Engine Options ───────────────────────────────────────────────────────────

export interface WorkspaceEngineOptions {
    workspaceRoot: string;
    /** Directory under workspaceRoot/.brain for engine state. Default: "workspace" */
    stateDirectory?: string;
    /** Maximum concurrent transactions. Default: 8 */
    maxConcurrentTransactions?: number;
    /** If true, skip actual FS writes (preview / dry-run mode). Default: false */
    dryRun?: boolean;
    /** If true, always rollback on any error. Default: true */
    rollbackOnError?: boolean;
}

// ─── Engine Diagnostics ───────────────────────────────────────────────────────

export interface WorkspaceEngineDiagnostics {
    totalTransactions: number;
    committedTransactions: number;
    rolledBackTransactions: number;
    totalPatchesApplied: number;
    totalArtifactsApplied: number;
    totalChanges: number;
    activeLocks: number;
    journalEntries: number;
}
