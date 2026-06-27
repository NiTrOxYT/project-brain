// ─── Default Launch Wrapper Integration ────────────────────────────────────────
export class LaunchWrapperIntegration {
    providerId;
    capabilities;
    effectiveCapabilities;
    transport = "launch-wrapper";
    session;
    constructor(providerId, capabilities) {
        this.providerId = providerId;
        this.capabilities = capabilities;
        this.effectiveCapabilities = {
            promptBridge: false,
            responseBridge: false,
            toolBridge: false,
            workspaceBridge: false,
            streaming: true,
            interactiveTTY: true,
            contextProvider: false
        };
    }
    async connect(session) {
        this.session = session;
    }
    async disconnect() {
        this.session = undefined;
    }
    async requestContext(request) {
        const { ContextProvider } = await import("../context-provider/provider.js");
        const provider = new ContextProvider(request.workspaceRoot, request.workspaceRoot);
        return provider.getContext(request);
    }
}
export class LaunchWrapperDescriptor {
    id;
    providerId;
    transport = "launch-wrapper";
    priority = 10;
    capabilities;
    constructor(providerId) {
        this.id = `${providerId}-launch-wrapper`;
        this.providerId = providerId;
        this.capabilities = {
            launchWrapper: true,
            promptBridge: false,
            responseBridge: false,
            toolBridge: false,
            workspaceBridge: false,
            mcpBridge: false,
            apiBridge: false,
            contextProvider: false
        };
    }
    async supports(environment) {
        // Launch wrappers are universally supported on all shells/OSs
        return { supported: true };
    }
    async create() {
        return new LaunchWrapperIntegration(this.providerId, this.capabilities);
    }
}
