import { RuntimeTask, RuntimeContext } from "../agent-runtime/types";
import { ProviderMetadata, ProviderProfile } from "../provider-runtime/types";

export interface PromptSection {
    id: string;
    name: string;
    content: string;
    priority: number;
}

export interface PromptContext {
    task: RuntimeTask;
    runtimeContext: RuntimeContext;
    knowledgeFusion?: any;
    architectureMemory?: any;
    repositoryEvolution?: any;
    learningEngine?: any;
    engineeringPlan?: any;
    workspaceMetadata?: any;
    executionGraph?: any;
    relationshipGraph?: any;
    executionHistory?: any;
}

export interface PromptStrategy {
    strategyName: string;
    rules: string[];
}

export interface PromptProfile {
    providerId: string;
    profile: PromptProviderProfile;
}

export interface PromptTemplate {
    id: string;
    type: "Feature" | "Bugfix" | "Refactor" | "Repair" | "Review" | "Documentation" | "Testing" | "Validation" | "Architecture" | "Analysis";
    templateText: string;
}

export interface PromptMetadata {
    timestamp: string;
    providerId: string;
    templateId: string;
    hash: string;
    version: string;
}

export interface PromptTokenBudget {
    maxTokens: number;
    allocatedTokens: {
        systemPrompt: number;
        architecture: number;
        relevantFiles: number;
        relationships: number;
        executionGraph: number;
        memory: number;
        learning: number;
        taskInstructions: number;
        validationRules: number;
    };
    actualTokens: number;
    originalTokens?: number;
    providerLimit?: number;
    compressionRatio?: number;
    removedSections?: string[];
    truncatedSections?: string[];
    remainingBudget?: number;
}

export interface PromptOptimization {
    id: string;
    type: "whitespace-normalization" | "duplicate-removal" | "instruction-merging" | "summary-compression" | "symbol-prioritization" | "relationship-collapsing" | "memory-ranking" | "dead-section-removal" | "dead-code-pruning";
    description: string;
    tokensSaved: number;
}

export interface PromptDiagnostics {
    assemblyDurationMs: number;
    originalSize: number;
    optimizedSize: number;
    compressionRatio: number;
    tokenBudget: PromptTokenBudget;
    optimizationsApplied: PromptOptimization[];
    stages: string[];
}

export interface PromptPackage {
    id: string;
    task: RuntimeTask;
    context: PromptContext;
    renderedPrompt: string;
    metadata: PromptMetadata;
    diagnostics: PromptDiagnostics;
}

export interface PromptStatistics {
    averagePromptSize: number;
    compressionRatio: number;
    tokenSavings: number;
    assemblyTime: number;
    optimizationCount: number;
    providerUtilization: Record<string, number>;
    templateUsage: Record<string, number>;
    promptSuccessRate: number;
}

export interface PromptConstraints {
    rules: string[];
}

export interface PromptAssemblyResult {
    promptPackage: PromptPackage;
    success: boolean;
}

export interface PromptProviderProfile {
    providerId: string;
    contextWindow: number;
    streamingSupport: boolean;
    reasoningSupport: boolean;
    preferredFormat: "string" | "json";
    jsonCapability: boolean;
    patchCapability: boolean;
    toolSupport: boolean;
    codeGenerationQuality: number;
    documentationQuality: number;
    planningQuality: number;
    temperatureRestrictions: { min: number; max: number; default: number };
}

export interface PromptRequest {
    task: RuntimeTask;
    context: RuntimeContext;
    providerId: string;
}

export interface PromptResponse {
    promptPackage: PromptPackage;
}

export interface PromptFingerprint {
    hash: string;
    templateVersion: string;
    learningVersion: string;
    knowledgeVersion: string;
    architectureVersion: string;
    providerId: string;
    taskId: string;
    timestamp: string;
}

export interface PromptCacheEntry {
    key: string;
    promptPackage: PromptPackage;
    timestamp: string;
}

export interface PromptRanking {
    sectionId: string;
    score: number;
}

export interface PromptCompilerStage {
    name: string;
    durationMs: number;
    inputSize: number;
    outputSize: number;
}

export interface ProviderExecutionRequest extends RuntimeTask {
    runtimeTask: RuntimeTask;
    promptPackage: PromptPackage;
    renderedPrompt: string;
    providerProfile: ProviderProfile;
    metadata: Record<string, any>;
}

export type PromptVersion = string;

export interface LearningSnapshotReference {
    version: string;
    hash: string;
}

export interface KnowledgeSnapshotReference {
    version: string;
    hash: string;
}

export interface ArchitectureSnapshotReference {
    version: string;
    hash: string;
}

export interface PromptSnapshot {
    id: string;
    promptPackage: PromptPackage;
    timestamp: string;
}
