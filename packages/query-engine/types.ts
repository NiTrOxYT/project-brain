import { ContextPackage } from "../context-assembler";

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
}

export interface QueryResult {

    generatedAt: string;

    request: QueryRequest;

    context: ContextPackage;

    diagnostics: QueryDiagnostics;

}
