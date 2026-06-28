import type { GatewaySession } from "../domain/index.js";

export interface ProviderCapabilities {
    launchWrapper:   boolean;
    promptBridge:    boolean;
    responseBridge:  boolean;
    toolBridge:      boolean;
    workspaceBridge: boolean;
    mcpBridge:       boolean;
    apiBridge:       boolean;
    contextProvider: boolean;
    supportsMcp:     boolean;
    supportsToolCalling: boolean;
    supportsPlugins: boolean;
    supportsSdk:     boolean;
}

export interface EffectiveCapabilities {
    promptBridge:    boolean;
    responseBridge:  boolean;
    toolBridge:      boolean;
    workspaceBridge: boolean;
    streaming:       boolean;
    interactiveTTY:  boolean;
    contextProvider: boolean;
    supportsMcp:     boolean;
    supportsToolCalling: boolean;
    supportsPlugins: boolean;
    supportsSdk:     boolean;
}

export interface ToolInvocation {
    name:      string;
    arguments: Record<string, any>;
    result?:   any;
}

export interface OptimizedPrompt {
    originalPrompt:  string;
    optimizedPrompt: string;
    contextDigest:   string;
    retrievedFiles:  string[];
    tokenEstimate:   number;
}

export interface ProviderBridge {
    readonly providerId:   string;
    readonly capabilities: ProviderCapabilities;
    start(session: GatewaySession): Promise<void>;
    onUserPrompt?(prompt: string): Promise<OptimizedPrompt>;
    onAssistantResponse?(response: string): Promise<void>;
    onToolInvocation?(tool: ToolInvocation): Promise<void>;
    stop(): Promise<void>;
}

import type { RankedFile, MemoryEntry, ContextSnippet, DependencySummary } from "../context-provider/types.js";

export type ContextConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface ContextEvaluation {
    confidence: ContextConfidence;
    shouldFallback: boolean;
    reasons: string[];
}

export interface ContextEnvelope {
    systemInstructions:  string;
    architectureSummary: string;
    rankedFiles:         RankedFile[];
    snippets:            ContextSnippet[];
    semanticMemory:      MemoryEntry[];
    dependencySummary:   DependencySummary[];
    estimatedTokens:     number;
    confidence:          number;
    snapshotId:          string;
    retrievalTimeMs:     number;
}
