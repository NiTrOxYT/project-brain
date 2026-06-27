// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — Kernel — Events Catalog
// All event kinds defined in a single central catalog to avoid string literals.
// Includes all legacy gateway event kinds for backward compatibility.
// ──────────────────────────────────────────────────────────────────────────────

export const Events = {
    // Legacy / Gateway lifecycle events
    PromptReceived:                 "PromptReceived" as const,
    QueryAnalysisStarted:           "QueryAnalysisStarted" as const,
    QueryAnalysisCompleted:         "QueryAnalysisCompleted" as const,
    ContextRetrievalStarted:        "ContextRetrievalStarted" as const,
    ContextRetrievalCompleted:      "ContextRetrievalCompleted" as const,
    LearningMatchStarted:           "LearningMatchStarted" as const,
    LearningMatchCompleted:         "LearningMatchCompleted" as const,
    PromptOptimizationStarted:      "PromptOptimizationStarted" as const,
    PromptOptimizationCompleted:    "PromptOptimizationCompleted" as const,
    ProviderLaunching:              "ProviderLaunching" as const,
    ProviderStarted:                "ProviderStarted" as const,
    ProviderOutput:                 "ProviderOutput" as const,
    ProviderCompleted:              "ProviderCompleted" as const,
    ProviderFailed:                 "ProviderFailed" as const,
    WorkspaceTransactionStarted:    "WorkspaceTransactionStarted" as const,
    WorkspaceTransactionCommitted:  "WorkspaceTransactionCommitted" as const,
    LearningRecordStarted:          "LearningRecordStarted" as const,
    LearningRecorded:               "LearningRecorded" as const,
    SessionStarted:                 "SessionStarted" as const,
    SessionCompleted:               "SessionCompleted" as const,
    SessionFailed:                  "SessionFailed" as const,
    DiagnosticsStarted:             "DiagnosticsStarted" as const,
    DiagnosticsCompleted:           "DiagnosticsCompleted" as const,

    // New/Refined architecture events
    WorkspaceChanged:               "WorkspaceChanged" as const,
    SnapshotCreated:                "SnapshotCreated" as const,
    ConversationCaptured:           "ConversationCaptured" as const,
    PromptOptimized:                "PromptOptimized" as const,
    ProviderFinished:               "ProviderFinished" as const,
    TimelineUpdated:                "TimelineUpdated" as const,
    SearchIndexed:                  "SearchIndexed" as const,
    MetricsUpdated:                 "MetricsUpdated" as const,

    // BUILD-062A new events
    UserPromptReceived:             "UserPromptReceived" as const,
    ProviderRequest:                "ProviderRequest" as const,
    ProviderResponse:               "ProviderResponse" as const,
    ToolInvocation:                 "ToolInvocation" as const,
    ConversationUpdated:            "ConversationUpdated" as const,
    MemoryUpdated:                  "MemoryUpdated" as const,
};

export type GatewayEventKind = typeof Events[keyof typeof Events];

export interface GatewayEvent {
    readonly kind:      GatewayEventKind;
    readonly sessionId: string;
    readonly timestamp: string;
    readonly payload:   Readonly<Record<string, unknown>>;
}

export type EventHandler = (event: GatewayEvent) => void;
export type Unsubscribe  = () => void;
export type SubscriptionKind = GatewayEventKind | "*";
