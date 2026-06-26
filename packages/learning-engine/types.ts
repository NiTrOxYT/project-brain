// ──────────────────────────────────────────────────────────────────────────────
// BUILD-052 — Learning Engine — Types
// ──────────────────────────────────────────────────────────────────────────────

export type ExecutionOutcome = "success" | "failure" | "cancelled" | "aborted";

export type LearningCategory =
    | "Compilation"
    | "Runtime"
    | "Test"
    | "Workspace"
    | "Architecture"
    | "Dependency"
    | "Formatting"
    | "Provider"
    | "Timeout"
    | "Cancellation"
    | "Refactor"
    | "Documentation"
    | "Feature"
    | "Bugfix";

export type LearningSource = "autonomous-runtime" | "manual";

export interface EvidenceReference {
    executionId: string;
    timestamp: string;
}

export type ConfidenceScore = number; // Between 0 and 1

export interface LearningRecord {
    id: string;
    timestamp: string;
    category: LearningCategory;
    source: LearningSource;
    content: any;
    confidence: ConfidenceScore;
    evidence: EvidenceReference[];
}

export interface LearningExperience {
    id: string;
    planId: string;
    timestamp: string;
    providerId: string;
    modelId: string;
    taskType: string;
    taskTitle: string;
    outcome: ExecutionOutcome;
    durationMs: number;
    tokensUsed: number;
    cost: number;
    filesModified: string[];
    repairCycles: number;
    retries: number;
    errors: string[];
    validationScore: number;
}

export interface RepairPattern {
    id: string;
    errorType: string;
    errorMessagePattern: string;
    recommendedFix: string;
    providerId: string;
    successCount: number;
    totalCount: number;
    averageDurationMs: number;
    confidence: ConfidenceScore;
    evidence: EvidenceReference[];
}

export interface FailurePattern {
    id: string;
    category: LearningCategory;
    messagePattern: string;
    occurrenceCount: number;
    resolvedCount: number;
    evidence: EvidenceReference[];
}

export interface ProviderPerformance {
    providerId: string;
    successRate: number;
    failureRate: number;
    repairSuccessRate: number;
    averageDurationMs: number;
    averageTokens: number;
    averageCost: number;
    averageValidationScore: number;
    preferredLanguages: string[];
    preferredTaskTypes: string[];
    preferredRepositorySize: string;
    rollingConfidence: ConfidenceScore;
    totalExecutions: number;
}

export interface PromptPerformance {
    promptHash: string;
    promptBody: string;
    providerId: string;
    taskType: string;
    successRate: number;
    averageValidationScore: number;
    averageRepairCount: number;
    averageTokens: number;
    averageCost: number;
    useCount: number;
}

export interface OptimizationRule {
    id: string;
    description: string;
    ruleType: "provider-preference" | "timeout-adaptation" | "validator-skipping" | "retry-reduction" | "parallel-execution";
    condition: any;
    action: any;
    confidence: ConfidenceScore;
    evidenceCount: number;
    lastUpdated: string;
    evidence: EvidenceReference[];
}

export interface ExperienceSummary {
    totalExecutions: number;
    successRate: number;
    averageDurationMs: number;
    totalCost: number;
}

export interface LearningStatistics {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageRepairCount: number;
    averageRetries: number;
    averageValidationDuration: number;
    averageExecutionDuration: number;
    providerUsage: Record<string, number>;
    tokenSavings: number;
    costSavings: number;
    optimizationCount: number;
    learningGrowth: number;
}

export interface LearningDiagnostics {
    version: string;
    statistics: LearningStatistics;
    databaseSize: number;
    lastCompactTime?: string;
}

export interface LearningRequest {
    taskType: string;
    taskTitle: string;
    language?: string;
    file?: string;
    symbol?: string;
    preferredModel?: string;
    contextBudget?: number;
}

export interface LearningResult {
    success: boolean;
    recordsAdded: number;
    diagnostics?: LearningDiagnostics;
}

export interface LearningSnapshot {
    timestamp: string;
    experiences: LearningExperience[];
    providers: ProviderPerformance[];
    repairs: RepairPattern[];
    failures: FailurePattern[];
    prompts: PromptPerformance[];
    optimizations: OptimizationRule[];
    metadata: Record<string, any>;
}

export interface LearningRecommendation {
    recommendedProvider: string;
    recommendedModel?: string;
    recommendedPrompt?: string;
    recommendedTimeout?: number;
    recommendedRetryCount?: number;
    recommendedValidatorPipeline?: string[];
    recommendedRepairStrategy?: string;
    recommendedExecutionOrder?: string[];
    providerConfidence: ConfidenceScore;
    promptConfidence: ConfidenceScore;
    rulesApplied: string[];
}
