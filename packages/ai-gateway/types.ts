// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — AI Gateway — Types Shim
// Re-exports domain and kernel models, maintaining legacy types for compatibility.
// ──────────────────────────────────────────────────────────────────────────────

import type { AgentCapability } from "../agent-runtime/types.js";
import type { GatewaySession, ProviderHealthStatus } from "../domain/index.js";

// Re-export Event types from Kernel
export type {
    GatewayEventKind,
    GatewayEvent,
    EventHandler,
    Unsubscribe,
} from "../kernel/index.js";

// Re-export models from Domain
export type {
    TimelineEntry,
    PromptDiffChunkKind,
    PromptDiffChunk,
    PromptDiff,
    GatewaySessionMetrics,
    SessionOutcome,
    GatewaySession,
    ProviderHealthStatus,
    ProviderRegistration,
    GlobalConfig,
    ProviderStats,
    AggregateMetrics,
    AdapterDiagnostic,
    GatewayDiagnosticReport,
} from "../domain/index.js";

// ─── Provider Process & Launch Interface ──────────────────────────────────────

export interface ExitResult {
    code:   number | null;
    signal: NodeJS.Signals | null;
}

export interface ProviderAdapterMetadata {
    id:           string;
    displayName:  string;
    version:      string;
    capabilities: AgentCapability[];
    supportsStreaming: boolean;
}

export interface LaunchOptions {
    session:         GatewaySession;
    optimizedPrompt: string;
    extraArgs:       string[];
    env?:            NodeJS.ProcessEnv;
}

export interface ProviderProcess {
    pid:    number;
    stdout: AsyncIterable<string>;
    stderr: AsyncIterable<string>;
    cancel(): Promise<void>;
    wait():   Promise<ExitResult>;
}

export interface ProviderAdapter {
    readonly id:          string;
    readonly displayName: string;
    readonly version:     string;
    readonly binaryName:  string;
    detect():             Promise<boolean>;
    resolvedBinaryPath(): Promise<string>;
    launch(opts: LaunchOptions): Promise<ProviderProcess>;
    metadata():  ProviderAdapterMetadata;
    health():    Promise<ProviderHealthStatus>;
    capabilities(): AgentCapability[];
}
