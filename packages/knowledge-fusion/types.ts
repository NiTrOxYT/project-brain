export interface CandidateSignals {
    semantic: number;
    execution: number;
    relationships: number;
    graph: number;
    architecture: number;
    evolution: number;
}

export interface KnowledgeCandidate {
    id: string;
    type: "file" | "symbol" | "relationship" | "execution" | "memory";
    score: number;
    provenance: string[];
    metadata: Record<string, unknown>;
    signals: CandidateSignals;
    confidence: number;
    reasons: string[];
}

export interface FusionWeights {
    semantic: number;
    execution: number;
    relationships: number;
    graph: number;
    architecture: number;
    evolution: number;
}

export interface FusionStrategy {
    score(candidate: KnowledgeCandidate): number;
}

export interface FusionRequest {
    query: string;
    options?: {
        includeExecution?: boolean;
        includeRelationships?: boolean;
        includeGraph?: boolean;
        includeArchitectureMemory?: boolean;
    };
    semanticCandidates?: { path: string; score: number }[];
}

export interface FusionDiagnostics {
    semanticContribution: number;
    executionContribution: number;
    relationshipContribution: number;
    graphContribution: number;
    architectureContribution: number;
    evolutionContribution: number;
    mergedCandidates: number;
    duplicateEliminations: number;
}

export interface FusionResult {
    candidates: KnowledgeCandidate[];
    diagnostics: FusionDiagnostics;
}
