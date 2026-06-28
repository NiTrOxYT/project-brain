import {
    SemanticSnapshot,
    SnapshotSection,
    SnapshotFile,
    SnapshotSymbol,
    SnapshotDependency,
    SnapshotRelationship,
    SnapshotGraphNode,
    SnapshotGraphEdge,
    SnapshotFingerprint,
    CompilationStage
} from "../context-compiler/types.js";

export interface RetrievalRequest {
    query: string;
    maxTokens?: number;
    providerId?: string;
    includeExecution?: boolean;
    includeRelationships?: boolean;
    includeGraph?: boolean;
    includeArchitectureMemory?: boolean;
    strategy?: RetrievalStrategy;
    expansionDepth?: number;
    useCache?: boolean;
    snapshotId?: string;
}

export type RetrievalStrategy = "target-centric" | "dependency-centric" | "architecture-centric" | "learning-centric" | "hybrid";

export interface RetrievalResult {
    retrievalPackage: RetrievalPackage;
    metrics: RetrievalMetrics;
    cacheHit: boolean;
}

export interface RetrievalSection {
    id: string;
    name: string;
    kind: SnapshotSection["kind"];
    content: string;
    priority: number;
    estimatedTokens: number;
    reason: RetrievalReason;
}

export interface RetrievalCandidate {
    path: string;
    score: number;
    reasons: string[];
    file?: SnapshotFile;
}

export interface RetrievalGraph {
    nodes: SnapshotGraphNode[];
    edges: SnapshotGraphEdge[];
    topologicalOrder: string[];
}

export interface RetrievalEdge {
    fromId: string;
    toId: string;
    kind: string;
    weight: number;
}

export interface RetrievalNode {
    id: string;
    type: string;
    title: string;
    score: number;
}

export type RetrievalReason =
    | "primary-target"
    | "dependency"
    | "architecture"
    | "learning-experience"
    | "relationship-link"
    | "evolution-history"
    | "graph-context"
    | "system-config";

export interface RetrievalScore {
    graphDistance: number;
    dependencyDepth: number;
    symbolRelevance: number;
    architectureImportance: number;
    learningScore: number;
    historyModifications: number;
    relationshipStrength: number;
    finalScore: number;
}

export interface RetrievalBudget {
    maxTokens: number;
    allocated: {
        system: number;
        task: number;
        architecture: number;
        files: number;
        symbols: number;
        relationships: number;
        learning: number;
        validation: number;
    };
    actual: {
        system: number;
        task: number;
        architecture: number;
        files: number;
        symbols: number;
        relationships: number;
        learning: number;
        validation: number;
    };
}

export interface RetrievalMetrics {
    retrievalDurationMs: number;
    stages: RetrievalStage[];
    expansionCount: number;
    compressionRatio: number;
    retrievedFilesCount: number;
    retrievedSymbolsCount: number;
    retrievedEdgesCount: number;
    retrievedRulesCount: number;
    tokenEstimate: number;
}

export interface RetrievalStage {
    name: string;
    durationMs: number;
    success: boolean;
}

export interface RetrievalStatistics {
    totalRetrievals: number;
    averageDurationMs: number;
    averageFilesRetrieved: number;
    averageSymbolsRetrieved: number;
    averageTokens: number;
    cacheHitRate: number;
    compressionRatioAverage: number;
}

export interface RetrievalDiagnostics {
    retrievalId: string;
    timeline: { stage: string; ms: number }[];
    rankingExplanation: { path: string; score: number; reasons: string[] }[];
    budgetAllocation: RetrievalBudget;
    expansionTree: { path: string; children: string[] }[];
    compressionSummary: { originalTokens: number; finalTokens: number; ratio: number };
}

export interface RetrievalCacheEntry {
    queryFingerprint: string;
    snapshotId: string;
    retrievalPackage: RetrievalPackage;
    storedAt: string;
}

export interface RetrievalSnapshotReference {
    snapshotId: string;
    createdAt: string;
    fingerprint: SnapshotFingerprint;
}

export interface RetrievalProfile {
    providerId: string;
    contextWindow: number;
    budgetLimit: number;
}

export interface RetrievalExpansion {
    path: string;
    depth: number;
    kind: "imports" | "exports" | "callers" | "consumers";
}

export interface RetrievalCompression {
    originalSizeBytes: number;
    compressedSizeBytes: number;
    ratio: number;
}

export interface RetrievalValidation {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

export interface RetrievalPackage {
    retrievalId: string;
    snapshotId: string;
    sections: RetrievalSection[];
    candidates: RetrievalCandidate[];
    graph: RetrievalGraph;
    symbols: SnapshotSymbol[];
    dependencies: SnapshotDependency[];
    relationships: SnapshotRelationship[];
}
