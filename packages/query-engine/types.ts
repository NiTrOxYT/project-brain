import { ContextPackage } from "../context-assembler/index.js";

export interface QueryRequest {

    query: string;

    maxTokens?: number;

    includeExecution?: boolean;

    includeRelationships?: boolean;

    includeGraph?: boolean;
    includeArchitectureMemory?: boolean;
    useCache?: boolean;

}

export interface QueryDiagnostics {

    cacheHit: boolean;

    synchronized: boolean;

    planningTimeMs: number;

    retrievalTimeMs: number;

    assemblyTimeMs: number;

    totalTimeMs: number;

    retrievedFiles: number;

    selectedFiles: number;

    selectedSymbols: number;

    selectedRelationships: number;
    error?: string;
    retrievalDuration?: number;
    retrievedSymbols?: number;
    retrievedRules?: number;
    compressionRatio?: number;
    retrievalCacheHit?: boolean;
    tokenEstimate?: number;
    activeAgents?: number;
    completedAgents?: number;
    collaborationEfficiency?: number;
    consensusDuration?: number;
    conflictsDetected?: number;
    conflictsResolved?: number;
    artifactReuseRate?: number;

    selectedProvider?: string;
    providerHealth?: string;
    runtimeMetricsSummary?: any;
    executionSnapshotId?: string;

    /** Workspace engine stats when a WorkspaceEngine is active. */
    workspaceDiagnostics?: {
        totalTransactions: number;
        totalChanges: number;
        totalPatchesApplied: number;
        rolledBackTransactions: number;
        totalArtifactsApplied: number;
        activeLocks: number;
    };

    providerVersion?: string;
    selectedModel?: string;
    sessionId?: string;
    promptTokens?: number;
    completionTokens?: number;
    estimatedCost?: number;
    fallbackChain?: string[];
    selectionReason?: string;
    capabilityScore?: number;

    /** Learning Engine diagnostics */
    learningRecommendation?: any;
    optimizationRulesUsed?: string[];
    providerConfidence?: number;
    promptConfidence?: number;
    learningVersion?: string;

    /** Context Compiler / Semantic Snapshot diagnostics */
    snapshotId?: string;
    snapshotVersion?: string;
    snapshotTokens?: number;
    snapshotIncremental?: boolean;
    snapshotCacheHit?: boolean;
    snapshotFileCount?: number;
    snapshotSymbolCount?: number;
    snapshotCompilationMs?: number;
}

export interface QueryResult {

    generatedAt: string;

    request: QueryRequest;

    context: ContextPackage;

    diagnostics: QueryDiagnostics;

}
