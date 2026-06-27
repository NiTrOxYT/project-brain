import {
    SemanticSnapshot,
    SnapshotFile,
    SnapshotSymbol,
    SnapshotDependency,
    SnapshotRelationship,
    SnapshotGraphNode,
    SnapshotGraphEdge,
    SnapshotArchitectureEntry,
    SnapshotEvolutionEntry,
    SnapshotLearningEntry,
    SnapshotSection,
    SnapshotFingerprint,
    CompilationStage
} from "../context-compiler/types";

export interface ContextSyncRequest {
    projectRoot: string;
    workspaceRoot: string;
    transactionId?: string;
    changedPaths?: string[];
    forceFullSync?: boolean;
}

export interface ContextSyncResult {
    snapshot: SemanticSnapshot;
    patch?: SnapshotPatch;
    metrics: IncrementalCompilationMetrics;
    cacheHit: boolean;
}

export interface ChangedFile {
    path: string;
    changeKind: "added" | "modified" | "deleted" | "renamed";
    oldPath?: string;
    sizeBytes?: number;
    lastModified?: string;
}

export interface ChangedSymbol {
    name: string;
    filePath: string;
    changeKind: "added" | "modified" | "deleted";
    kind: string;
}

export interface ChangedRelationship {
    subject: string;
    predicate: string;
    object: string;
    changeKind: "added" | "deleted";
}

export interface ChangedGraphNode {
    id: string;
    changeKind: "added" | "modified" | "deleted";
    type: string;
}

export interface ChangedArchitectureRule {
    category: string;
    title: string;
    changeKind: "added" | "modified" | "deleted";
}

export interface SyncOperation {
    type: "add" | "update" | "delete";
    target: "section" | "file" | "symbol" | "dependency" | "relationship" | "graph-node" | "graph-edge" | "architecture" | "learning";
    id: string;
    payload: any;
}

export type SyncReason = "file-changed" | "dependency-impact" | "graph-update" | "user-forced" | "initial-sync";

export interface SectionPatch {
    sectionId: string;
    op: "add" | "update" | "delete";
    content?: string;
    priority?: number;
    contentHash?: string;
    estimatedTokens?: number;
}

export interface GraphPatch {
    nodesAdded: SnapshotGraphNode[];
    nodesUpdated: SnapshotGraphNode[];
    nodesDeleted: string[];
    edgesAdded: SnapshotGraphEdge[];
    edgesDeleted: { fromId: string; toId: string; kind: string }[];
    topologicalOrder: string[];
}

export interface DependencyPatch {
    added: SnapshotDependency[];
    deleted: { fromPath: string; toPath: string; kind: string }[];
}

export interface SymbolPatch {
    added: SnapshotSymbol[];
    modified: SnapshotSymbol[];
    deleted: { name: string; filePath: string }[];
}

export interface SnapshotPatch {
    patchId: string;
    fromSnapshotId: string;
    toSnapshotId: string;
    createdAt: string;
    transactionId?: string;
    sectionPatches: SectionPatch[];
    graphPatch: GraphPatch;
    dependencyPatch: DependencyPatch;
    symbolPatch: SymbolPatch;
    metadataUpdate: {
        fileCount: number;
        symbolCount: number;
        dependencyEdgeCount: number;
        graphNodeCount: number;
        estimatedTokens: number;
        fingerprint: SnapshotFingerprint;
    };
}

export interface ContextChange {
    files: ChangedFile[];
    symbols: ChangedSymbol[];
    relationships: ChangedRelationship[];
    nodes: ChangedGraphNode[];
    architecture: ChangedArchitectureRule[];
    timestamp: string;
}

export interface IncrementalCompilationMetrics {
    totalDurationMs: number;
    stages: CompilationStage[];
    dirtyFilesCount: number;
    rebuiltSymbolsCount: number;
    rebuiltGraphNodesCount: number;
    patchSizeBytes: number;
    speedupRatio: number;
    incrementalRebuildPercentage: number;
}

export interface SynchronizationStatistics {
    totalSyncs: number;
    totalDurationMs: number;
    averageSyncDurationMs: number;
    averageDirtyFiles: number;
    averageRebuiltSymbols: number;
    averageRebuiltGraphNodes: number;
    averagePatchSizeBytes: number;
    cacheHitRatio: number;
    rebuildPercentageAverage: number;
}

export interface SynchronizationDiagnostics {
    syncId: string;
    metrics: IncrementalCompilationMetrics;
    dirtyFiles: string[];
    affectedModules: string[];
    timeline: { stage: string; ms: number }[];
    validationErrors: string[];
    validationWarnings: string[];
}

export interface SyncSnapshotVersion {
    snapshotId: string;
    parentSnapshotId?: string;
    createdAt: string;
    fingerprint: SnapshotFingerprint;
}

export interface SyncCheckpoint {
    checkpointId: string;
    snapshotId: string;
    timestamp: string;
    description: string;
}
