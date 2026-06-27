// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Public API
// ──────────────────────────────────────────────────────────────────────────────

// Types
export type {
    GatewayEventKind,
    GatewayEvent,
    EventHandler,
    Unsubscribe,
    TimelineEntry,
    PromptDiffChunkKind,
    PromptDiffChunk,
    PromptDiff,
    GatewaySessionMetrics,
    SessionOutcome,
    GatewaySession,
    ProviderHealthStatus,
    ExitResult,
    ProviderAdapterMetadata,
    LaunchOptions,
    ProviderProcess,
    ProviderAdapter,
    ProviderRegistration,
    GlobalConfig,
    ProviderStats,
    AggregateMetrics,
    AdapterDiagnostic,
    GatewayDiagnosticReport,
} from "./types.js";

// Errors
export {
    GatewayError,
    ProviderNotInstalledError,
    ProviderDetectionError,
    ProviderLaunchError,
    InstallationError,
    WrapperLoopError,
    SessionStoreError,
    MetricsStoreError,
    GlobalConfigError,
} from "./errors.js";

// Core infrastructure
export { GlobalPaths }             from "./global-paths.js";
export { GatewayEventBus, makeEvent } from "./event-bus.js";
export { AdapterRegistry }         from "./adapter-registry.js";
export { GatewaySessionStore }     from "./session.js";
export { GatewayMetricsStore }     from "./metrics.js";
export { GatewayHistory }          from "./history.js";
export { TimelineStore }           from "./timeline.js";
export type { HistoryFilter, HistoryRow } from "./history.js";
export { GatewayInstaller }        from "./installer.js";
export type { InstallerOptions, InstallResult } from "./installer.js";

// ─── Phase 2: Adapter system ──────────────────────────────────────────────────
export { BaseProviderAdapter }     from "./adapters/base.js";
export {
    ClaudeAdapter,
    CodexAdapter,
    OpenCodeAdapter,
    AiderAdapter,
    GeminiAdapter,
    OllamaAdapter,
} from "./adapters/index.js";

// ─── Phase 3: Prompt pipeline ─────────────────────────────────────────────────
export { PromptDiffEngine }        from "./prompt-diff.js";
export type { DiffOperation, DiffCostConfig } from "./prompt-diff.js";
export { GatewayPromptOptimizer }  from "./optimizer.js";
export type { OptimizerResult, OptimizerOptions } from "./optimizer.js";

// ─── Phase 4: Live Collaboration Console ─────────────────────────────────────
export { LiveConsole }             from "./console.js";
export type { ConsoleOptions }     from "./console.js";

// ─── Phase 5: Gateway Service ─────────────────────────────────────────────────
export { AiGatewayService }        from "./service.js";

// Pluggable Token Estimator (BUILD-061B)
export { EstimatorRegistry, BaseEstimator, ClaudeEstimator, CodexEstimator, GeminiEstimator, OllamaEstimator, GenericEstimator } from "./token-estimator.js";
export type { TokenUsage, CostEstimate, TokenEstimator } from "./token-estimator.js";




