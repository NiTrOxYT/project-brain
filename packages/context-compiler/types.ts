// ──────────────────────────────────────────────────────────────────────────────
// BUILD-054 — Context Compiler — Types
// Deterministic. Immutable snapshots. Zero AI execution. Zero source modification.
// ──────────────────────────────────────────────────────────────────────────────

// ─── Snapshot Primitives ─────────────────────────────────────────────────────

export interface SnapshotFingerprint {
    /** SHA256 of the full snapshot content (hex). */
    hash: string;
    /** SHA256 of filesystem index only. */
    filesystemHash: string;
    /** SHA256 of the knowledge graph only. */
    graphHash: string;
    /** SHA256 of architecture memory only. */
    architectureHash: string;
    /** SHA256 of repository evolution. */
    evolutionHash: string;
    /** SHA256 of learning engine state. */
    learningHash: string;
    /** Combined semver-style version string derived from hashes. */
    version: string;
}

export interface SnapshotMetadata {
    snapshotId: string;
    projectRoot: string;
    workspaceRoot: string;
    createdAt: string;
    compiledAt: string;
    compilerVersion: string;
    fingerprint: SnapshotFingerprint;
    /** Total number of compilation stages executed. */
    stageCount: number;
    /** Total wall-clock duration of compilation (ms). */
    compilationDurationMs: number;
    /** Files included in this snapshot. */
    fileCount: number;
    /** Symbols catalogued. */
    symbolCount: number;
    /** Dependency edges. */
    dependencyEdgeCount: number;
    /** Graph nodes. */
    graphNodeCount: number;
    /** Estimated tokens of the full snapshot. */
    estimatedTokens: number;
    /** Whether this was built via incremental compile from a prior snapshot. */
    incremental: boolean;
    /** If incremental, the parent snapshot ID. */
    parentSnapshotId?: string;
}

export interface SnapshotFile {
    path: string;
    relativePath: string;
    extension: string;
    sizeBytes: number;
    linesOfCode: number;
    language: string;
    lastModified: string;
    contentHash: string;
    /** Whether this file was added/changed/removed vs parent snapshot (incremental). */
    changeKind?: "added" | "modified" | "removed" | "unchanged";
}

export interface SnapshotSymbol {
    name: string;
    kind: "function" | "class" | "interface" | "type" | "variable" | "constant" | "enum" | "namespace" | "method" | "property";
    filePath: string;
    line: number;
    exported: boolean;
    /** Fingerprint of the symbol's source content. */
    contentHash: string;
}

export interface SnapshotDependency {
    fromPath: string;
    toPath: string;
    kind: "import" | "export" | "dynamic" | "re-export";
    importNames: string[];
}

export interface SnapshotRelationship {
    subject: string;
    predicate: "imports" | "exports" | "calls" | "extends" | "implements" | "uses" | "depends-on";
    object: string;
    weight: number;
}

export interface SnapshotGraphNode {
    id: string;
    type: string;
    title: string;
    filePath?: string;
    status: string;
    priority: number;
    metadata?: Record<string, any>;
}

export interface SnapshotGraphEdge {
    fromId: string;
    toId: string;
    kind: "depends-on" | "triggers" | "calls" | "inherits" | "uses";
    weight: number;
}

export interface SnapshotGraph {
    nodes: SnapshotGraphNode[];
    edges: SnapshotGraphEdge[];
    /** Topological ordering of node IDs (computed during compilation). */
    topologicalOrder: string[];
}

export interface SnapshotArchitectureEntry {
    category: string;
    title: string;
    description: string;
    tags: string[];
}

export interface SnapshotEvolutionEntry {
    path: string;
    changeCount: number;
    lastChanged: string;
    coChangedWith: string[];
}

export interface SnapshotLearningEntry {
    id: string;
    taskType: string;
    outcome: string;
    validationScore: number;
    filesModified: string[];
    timestamp: string;
}

export interface SnapshotSection {
    /** Unique ID for this section. */
    id: string;
    /** Human-readable section name. */
    name: string;
    /** Section kind determines rendering strategy. */
    kind:
        | "filesystem-index"
        | "knowledge-graph"
        | "architecture-memory"
        | "execution-graph"
        | "repository-evolution"
        | "learning-summary"
        | "dependency-graph"
        | "symbol-index"
        | "relationship-map";
    /** Serialized content (JSON). */
    content: string;
    /** Priority for budgeting (lower = higher priority). */
    priority: number;
    /** SHA256 of content. */
    contentHash: string;
    /** Estimated tokens (Math.ceil(content.length / 4)). */
    estimatedTokens: number;
    /** Source file paths contributing to this section. */
    sourcePaths: string[];
}

// ─── Snapshot ────────────────────────────────────────────────────────────────

export interface SemanticSnapshot {
    /** Unique snapshot identifier (hash-based). */
    snapshotId: string;
    metadata: SnapshotMetadata;
    /** All sections making up the snapshot, ordered by priority. */
    sections: SnapshotSection[];
    /** Flat file index. */
    files: SnapshotFile[];
    /** Flat symbol index. */
    symbols: SnapshotSymbol[];
    /** Dependency graph. */
    dependencies: SnapshotDependency[];
    /** High-level relationships. */
    relationships: SnapshotRelationship[];
    /** Unified execution/architecture graph. */
    graph: SnapshotGraph;
    /** Architecture knowledge entries. */
    architecture: SnapshotArchitectureEntry[];
    /** Repository evolution analytics. */
    evolution: SnapshotEvolutionEntry[];
    /** Learning experiences summary. */
    learning: SnapshotLearningEntry[];
    /** Semantic memory entries. */
    semanticMemory?: any[];
}

// ─── Delta ───────────────────────────────────────────────────────────────────

export interface SnapshotFileDelta {
    path: string;
    changeKind: "added" | "removed" | "modified";
}

export interface SnapshotSymbolDelta {
    name: string;
    filePath: string;
    changeKind: "added" | "removed" | "modified";
}

export interface SnapshotDelta {
    fromSnapshotId: string;
    toSnapshotId: string;
    computedAt: string;
    /** Files that changed between snapshots. */
    changedFiles: SnapshotFileDelta[];
    /** Symbols that changed between snapshots. */
    changedSymbols: SnapshotSymbolDelta[];
    /** Sections that changed (by section ID). */
    changedSectionIds: string[];
    /** Token delta (positive = grew, negative = shrunk). */
    tokenDelta: number;
    /** Whether a full recompile was required. */
    fullRecompileRequired: boolean;
}

// ─── Compilation ─────────────────────────────────────────────────────────────

export interface CompilationStage {
    name: string;
    startedAt: number;
    completedAt: number;
    durationMs: number;
    inputSizeBytes: number;
    outputSizeBytes: number;
    success: boolean;
    error?: string;
}

export interface CompilationMetrics {
    totalDurationMs: number;
    stages: CompilationStage[];
    estimatedTokens: number;
    fileCount: number;
    symbolCount: number;
    dependencyEdgeCount: number;
    graphNodeCount: number;
    cacheHit: boolean;
    incremental: boolean;
    tokenDelta?: number;
}

export interface SnapshotCompilationRequest {
    projectRoot: string;
    workspaceRoot: string;
    /** If provided, attempt incremental compile from this parent snapshot. */
    parentSnapshotId?: string;
    /** Force full recompile even if cache is valid. */
    force?: boolean;
    /** Optional filter: only compile these file paths. */
    filePaths?: string[];
}

export interface SnapshotCompilationResult {
    snapshot: SemanticSnapshot;
    metrics: CompilationMetrics;
    delta?: SnapshotDelta;
    cacheHit: boolean;
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface SnapshotValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    fingerprintValid: boolean;
    sectionsValid: boolean;
    graphValid: boolean;
    tokenEstimateValid: boolean;
}

// ─── Storage & Cache ─────────────────────────────────────────────────────────

export interface SnapshotCacheEntry {
    snapshotId: string;
    fingerprint: SnapshotFingerprint;
    storedAt: string;
    sizeBytes: number;
    filePath: string;
}

export interface SnapshotReference {
    snapshotId: string;
    createdAt: string;
    fingerprint: SnapshotFingerprint;
    estimatedTokens: number;
    incremental: boolean;
    parentSnapshotId?: string;
}

export interface SnapshotVersion {
    versionString: string;
    snapshotId: string;
    createdAt: string;
    description?: string;
}

// ─── Statistics ──────────────────────────────────────────────────────────────

export interface SnapshotStatistics {
    totalSnapshots: number;
    totalCompilations: number;
    cacheHits: number;
    cacheMisses: number;
    incrementalCompiles: number;
    fullCompiles: number;
    averageCompilationMs: number;
    averageTokens: number;
    tokenSavings: number;
    lastCompilationAt?: string;
    lastSnapshotId?: string;
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

export interface SnapshotDiagnostics {
    snapshotId: string;
    metrics: CompilationMetrics;
    validation: SnapshotValidationResult;
    statistics: SnapshotStatistics;
    stageBreakdown: CompilationStage[];
}

// ─── Context (raw inputs) ────────────────────────────────────────────────────

export interface SnapshotContext {
    projectRoot: string;
    workspaceRoot: string;
    /** Raw index.json content. */
    indexData?: any;
    /** Raw symbols.json content. */
    symbolsData?: any;
    /** Raw imports.json content. */
    importsData?: any;
    /** Raw relationships.json content. */
    relationshipsData?: any;
    /** Raw graph/graph.json content. */
    graphData?: any;
    /** Raw architecture memory entries. */
    architectureData?: any;
    /** Raw evolution analytics. */
    evolutionData?: any;
    /** Raw learning experiences + optimizations. */
    learningData?: any;
    /** Raw semantic.json content. */
    semanticMemoryData?: any;
    /** Paths of all files in the workspace. */
    filePaths?: string[];
}
