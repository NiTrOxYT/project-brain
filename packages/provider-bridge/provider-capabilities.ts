// ──────────────────────────────────────────────────────────────────────────────
// BUILD-068 — Provider Capabilities & Version Matrix
// ──────────────────────────────────────────────────────────────────────────────

export interface ProviderCapabilities {
    supportsGlobalConfiguration: boolean;
    supportsWorkspaceConfiguration: boolean;
    supportsMixedConfiguration: boolean;
    supportsStdioMcp: boolean;
    supportsHttpMcp: boolean;
    supportsRuntimeToolDiscovery: boolean;
    supportsRuntimeToolInvocation: boolean;
    supportsBehaviorVerification: boolean;
    supportsTelemetryVerification: boolean;
}

export interface ProviderVersionSupport {
    supported: boolean;
    minimumVersion?: string;
    maximumVersion?: string;
    warning?: string;
}
