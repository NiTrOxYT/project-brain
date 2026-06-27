// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — Domain — Core Data Models
// Isolated definitions of core application models.
// ──────────────────────────────────────────────────────────────────────────────

import type { AgentCapability } from "../agent-runtime/types.js";
import type { GatewayEventKind, GatewayEvent } from "../kernel/events.js";

// ─── Provider & Capabilities ──────────────────────────────────────────────────

export type ProviderHealthStatus = "healthy" | "degraded" | "offline" | "unknown";

export interface ProviderAdapterMetadata {
    id:                string;
    displayName:       string;
    version:           string;
    capabilities:      AgentCapability[];
    supportsStreaming: boolean;
}

export interface ProviderRegistration {
    id:          string;
    binaryPath:  string;
    wrapperPath: string;
    installedAt: string;
    enabled:     boolean;
    version?:    string;
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

export interface TimelineEntry {
    timestamp:   string;            // ISO-8601
    elapsed:     number;            // ms since session start
    kind:        GatewayEventKind;
    label:       string;            // human label e.g. "Context Retrieval"
    detail?:     string;            // one-liner e.g. "12 files · 3,241 tokens"
    durationMs?: number;            // filled on *Completed events
}

// ─── Prompt Diff ──────────────────────────────────────────────────────────────

export type PromptDiffChunkKind = "file" | "section" | "learningPattern" | "contextBlock";

export interface PromptDiffChunk {
    kind:       PromptDiffChunkKind;
    label:      string;      // "README.md", "auth flow"…
    tokenCount: number;
    reason:     string;      // "unrelated to query", "injected learning pattern"…
}

export interface PromptDiff {
    originalPrompt:     string;
    optimizedPrompt:    string;
    removed:            PromptDiffChunk[];
    added:              PromptDiffChunk[];
    tokensBefore:       number;
    tokensAfter:        number;
    savedTokens:        number;
    savedPct:           number;      // 0–100
    estimatedSavedUsd:  number;
}

// ─── Session Metrics ──────────────────────────────────────────────────────────

export interface GatewaySessionMetrics {
    promptTokens:    number;
    optimizedTokens: number;
    reductionPct:    number;
    retrievedFiles:  number;
    latencyMs:       number;
    estimatedCost:   number;
    learningHits:    number;
}

// ─── Session ──────────────────────────────────────────────────────────────────

export type SessionOutcome = "success" | "failed" | "cancelled";

export interface GatewaySession {
    id:               string;
    providerId:       string;
    projectRoot:      string;
    workspaceRoot:    string;
    originalPrompt:   string;
    optimizedPrompt:  string;
    contextDigest:    string;
    diff?:            PromptDiff;
    timeline:         TimelineEntry[];
    startedAt:        string;
    completedAt?:     string;
    outcome?:         SessionOutcome;
    metrics?:         GatewaySessionMetrics;
}

// ─── Global Config ────────────────────────────────────────────────────────────

export interface GlobalConfig {
    version:            string;
    installedProviders: Record<string, ProviderRegistration>;
    binDir:             string;
    wrappersDir:        string;
    lastUpdated:        string;
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

export interface ProviderStats {
    providerId:       string;
    sessionCount:     number;
    totalTokensSaved: number;
    totalCostSaved:   number;
    avgReductionPct:  number;
    avgLatencyMs:     number;
}

export interface AggregateMetrics {
    totalSessions:       number;
    totalTokensSaved:    number;
    totalCostSaved:      number;
    avgReductionPct:     number;
    avgRetrievalLatency: number;
    avgOptimizeLatency:  number;
    avgSessionDuration:  number;
    learningPatterns:    number;
    perProvider:         ProviderStats[];
    lastUpdated:         string;
}

// ─── Diagnostics ──────────────────────────────────────────────────────────────

export interface AdapterDiagnostic {
    id:          string;
    displayName: string;
    detected:    boolean;
    healthy:     boolean;
    status:      ProviderHealthStatus;
    binaryPath?: string;
    error?:      string;
}

export interface GatewayDiagnosticReport {
    globalPathsOk:   boolean;
    sessionStoreOk:  boolean;
    metricsStoreOk:  boolean;
    adapters:        AdapterDiagnostic[];
    pathContainsBin: boolean;
    timestamp:       string;
}
