// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — Kernel — Events Catalog
// All event kinds defined in a single central catalog to avoid string literals.
// Includes all legacy gateway event kinds for backward compatibility.
// ──────────────────────────────────────────────────────────────────────────────
export const Events = {
    // Legacy / Gateway lifecycle events
    PromptReceived: "PromptReceived",
    QueryAnalysisStarted: "QueryAnalysisStarted",
    QueryAnalysisCompleted: "QueryAnalysisCompleted",
    ContextRetrievalStarted: "ContextRetrievalStarted",
    ContextRetrievalCompleted: "ContextRetrievalCompleted",
    LearningMatchStarted: "LearningMatchStarted",
    LearningMatchCompleted: "LearningMatchCompleted",
    PromptOptimizationStarted: "PromptOptimizationStarted",
    PromptOptimizationCompleted: "PromptOptimizationCompleted",
    ProviderLaunching: "ProviderLaunching",
    ProviderStarted: "ProviderStarted",
    ProviderOutput: "ProviderOutput",
    ProviderCompleted: "ProviderCompleted",
    ProviderFailed: "ProviderFailed",
    WorkspaceTransactionStarted: "WorkspaceTransactionStarted",
    WorkspaceTransactionCommitted: "WorkspaceTransactionCommitted",
    LearningRecordStarted: "LearningRecordStarted",
    LearningRecorded: "LearningRecorded",
    SessionStarted: "SessionStarted",
    SessionCompleted: "SessionCompleted",
    SessionFailed: "SessionFailed",
    DiagnosticsStarted: "DiagnosticsStarted",
    DiagnosticsCompleted: "DiagnosticsCompleted",
    // New/Refined architecture events
    WorkspaceChanged: "WorkspaceChanged",
    SnapshotCreated: "SnapshotCreated",
    ConversationCaptured: "ConversationCaptured",
    PromptOptimized: "PromptOptimized",
    ProviderFinished: "ProviderFinished",
    TimelineUpdated: "TimelineUpdated",
    SearchIndexed: "SearchIndexed",
    MetricsUpdated: "MetricsUpdated",
    // BUILD-062A new events
    UserPromptReceived: "UserPromptReceived",
    ProviderRequest: "ProviderRequest",
    ProviderResponse: "ProviderResponse",
    ToolInvocation: "ToolInvocation",
    ConversationUpdated: "ConversationUpdated",
    MemoryUpdated: "MemoryUpdated",
};
