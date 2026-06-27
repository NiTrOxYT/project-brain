import type { GatewaySession } from "../domain/index.js";
import type { ProviderCapabilities, EffectiveCapabilities } from "./types.js";
import type { ContextRequest, ContextResponse } from "../context-provider/types.js";

export type IntegrationTransport =
    | "launch-wrapper"
    | "mcp"
    | "plugin"
    | "api"
    | "sdk"
    | "ipc"
    | "none";

export interface RuntimeEnvironment {
    operatingSystem:  "macos" | "linux" | "windows";
    features:         Set<string>;
    providerVersion?: string;
}

export interface SupportResult {
    supported: boolean;
    reason?:   string;
}

export interface ProviderIntegration {
    readonly providerId:          string;
    readonly capabilities:        ProviderCapabilities;
    readonly effectiveCapabilities: EffectiveCapabilities;
    readonly transport:           IntegrationTransport;
    connect(session: GatewaySession): Promise<void>;
    disconnect(): Promise<void>;
    requestContext?(request: ContextRequest): Promise<ContextResponse>;
}

export interface IntegrationDescriptor {
    readonly id:           string;
    readonly providerId:   string;
    readonly transport:    IntegrationTransport;
    readonly priority:     number;
    readonly capabilities: ProviderCapabilities;
    supports(environment: RuntimeEnvironment): Promise<SupportResult>;
    create(): Promise<ProviderIntegration>;
}

// ─── Default Launch Wrapper Integration ────────────────────────────────────────

export class LaunchWrapperIntegration implements ProviderIntegration {
    readonly providerId:          string;
    readonly capabilities:        ProviderCapabilities;
    readonly effectiveCapabilities: EffectiveCapabilities;
    readonly transport:           IntegrationTransport = "launch-wrapper";
    private session?:             GatewaySession;

    constructor(providerId: string, capabilities: ProviderCapabilities) {
        this.providerId = providerId;
        this.capabilities = capabilities;
        this.effectiveCapabilities = {
            promptBridge:    false,
            responseBridge:  false,
            toolBridge:      false,
            workspaceBridge: false,
            streaming:       true,
            interactiveTTY:  true,
            contextProvider: false
        };
    }

    async connect(session: GatewaySession): Promise<void> {
        this.session = session;
    }

    async disconnect(): Promise<void> {
        this.session = undefined;
    }

    async requestContext(request: ContextRequest): Promise<ContextResponse> {
        const { ContextProvider } = await import("../context-provider/provider.js");
        const provider = new ContextProvider(request.workspaceRoot, request.workspaceRoot);
        return provider.getContext(request);
    }
}

export class LaunchWrapperDescriptor implements IntegrationDescriptor {
    readonly id:           string;
    readonly providerId:   string;
    readonly transport:    IntegrationTransport = "launch-wrapper";
    readonly priority:     number = 10;
    readonly capabilities: ProviderCapabilities;

    constructor(providerId: string) {
        this.id = `${providerId}-launch-wrapper`;
        this.providerId = providerId;
        this.capabilities = {
            launchWrapper:   true,
            promptBridge:    false,
            responseBridge:  false,
            toolBridge:      false,
            workspaceBridge: false,
            mcpBridge:       false,
            apiBridge:       false,
            contextProvider: false
        };
    }

    async supports(environment: RuntimeEnvironment): Promise<SupportResult> {
        // Launch wrappers are universally supported on all shells/OSs
        return { supported: true };
    }

    async create(): Promise<ProviderIntegration> {
        return new LaunchWrapperIntegration(this.providerId, this.capabilities);
    }
}
