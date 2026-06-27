// ──────────────────────────────────────────────────────────────────────────────
// BUILD-049 — Provider Runtime — Types
// ──────────────────────────────────────────────────────────────────────────────

import { AgentCapability } from "../agent-runtime/types.js";

// ─── Health ───────────────────────────────────────────────────────────────────

export type ProviderHealth =
    | "Healthy"
    | "Busy"
    | "Offline"
    | "Degraded"
    | "Unavailable";

export interface ProviderHealthReport {
    status: ProviderHealth;
    authenticated: boolean;
    installed: boolean;
    latencyMs: number;
    lastHeartbeat: string;
    version: string;
    details?: Record<string, any>;
}

// ─── Limits ───────────────────────────────────────────────────────────────────

export interface ProviderLimits {
    maxContextTokens: number;
    maxOutputTokens: number;
    maxParallelTasks: number;
    supportsStreaming: boolean;
    supportsImages: boolean;
    supportsTools: boolean;
    supportsSessions: boolean;
    supportsCancellation: boolean;
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

export interface ProviderPricing {
    promptTokenCostPer1k: number;  // USD
    completionTokenCostPer1k: number;  // USD
    currency: string;
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export interface ProviderMetadata {
    id: string;
    displayName: string;
    version: string;
    vendor: string;
    priority: number;
    supportedCapabilities: AgentCapability[];
    supportedLanguages: string[];
    supportedModels: string[];
    defaultModel: string;
    supportsStreaming: boolean;
    supportsSessions: boolean;
    supportsCancellation: boolean;
    supportsPauseResume: boolean;
    runtimeCompatibility: string;
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export interface ProviderProfile {
    metadata: ProviderMetadata;
    limits: ProviderLimits;
    pricing?: ProviderPricing;
    tags?: string[];
}

// ─── Session ──────────────────────────────────────────────────────────────────

export type SessionStatus = "active" | "paused" | "completed" | "expired" | "error";

export interface SessionCheckpoint {
    id: string;
    timestamp: string;
    taskId: string;
    state: Record<string, any>;
}

export interface ProviderSession {
    id: string;
    providerId: string;
    createdAt: string;
    lastActiveAt: string;
    status: SessionStatus;
    checkpoints: SessionCheckpoint[];
    metadata?: Record<string, any>;
}

// ─── Streaming ────────────────────────────────────────────────────────────────

export type StreamEventType =
    | "Token"
    | "Reasoning"
    | "Progress"
    | "Artifact"
    | "Log"
    | "Status"
    | "Completed"
    | "Failed";

export interface StreamEvent {
    type: StreamEventType;
    taskId: string;
    timestamp: string;
    payload?: Record<string, any>;
    /** For Token events */
    token?: string;
    /** For Progress events */
    progress?: number;
    /** For Artifact events */
    artifactId?: string;
    /** For Log events */
    message?: string;
    /** For Status events */
    status?: string;
    /** For Failed events */
    error?: string;
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

export interface ProviderMetrics {
    provider: string;
    model: string;
    taskId: string;
    promptTokens: number;
    completionTokens: number;
    latencyMs: number;
    executionDurationMs: number;
    estimatedCost: number;
    retries: number;
    workspaceWrites: number;
    artifactsGenerated: number;
    executionEvents: number;
    streamEvents: number;
    fallbackCount: number;
    knowledgeCacheHits: number;
    timestamp: string;
}

export interface CumulativeMetrics {
    provider: string;
    model: string;
    requestCount: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalEstimatedCost: number;
    averageLatencyMs: number;
    totalArtifactsGenerated: number;
    totalFallbackCount: number;
    lastUpdated: string;
}

// ─── Negotiation ──────────────────────────────────────────────────────────────

export interface NegotiationResult {
    selectedProvider: string;
    selectedModel: string;
    fallbackChain: string[];
    selectionReason: string;
    capabilityScore: number;
    negotiatedAt: string;
}

export interface NegotiationContext {
    capability: AgentCapability;
    preferredModel?: string;
    requiredLanguages?: string[];
    maxCost?: number;
    sessionId?: string;
}

// ─── Provider SDK Diagnostics ─────────────────────────────────────────────────

export interface ProviderSDKDiagnostics {
    totalProviders: number;
    healthyProviders: number;
    totalSessions: number;
    totalExecutions: number;
    cumulativeMetrics: CumulativeMetrics[];
    lastNegotiationResult?: NegotiationResult;
    registeredProviderIds: string[];
}
