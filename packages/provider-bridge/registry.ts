import type { IntegrationDescriptor, ProviderIntegration } from "./integration.js";

export class IntegrationRegistry {
    private static descriptors: IntegrationDescriptor[] = [];

    static register(desc: IntegrationDescriptor): void {
        if (!this.descriptors.find(d => d.id === desc.id)) {
            this.descriptors.push(desc);
        }
    }

    static list(): IntegrationDescriptor[] {
        return this.descriptors;
    }

    static clear(): void {
        this.descriptors = [];
    }
}

export class ActiveBridgeRegistry {
    private static bridges: Map<string, ProviderIntegration> = new Map();

    static register(providerId: string, bridge: ProviderIntegration): void {
        this.bridges.set(providerId, bridge);
    }

    static get(providerId: string): ProviderIntegration | undefined {
        return this.bridges.get(providerId);
    }

    static remove(providerId: string): void {
        this.bridges.delete(providerId);
    }

    static clear(): void {
        this.bridges.clear();
    }
}

// Statically register default launch wrapper integrations
import { LaunchWrapperDescriptor } from "./integration.js";
IntegrationRegistry.register(new LaunchWrapperDescriptor("opencode"));
IntegrationRegistry.register(new LaunchWrapperDescriptor("claude"));
IntegrationRegistry.register(new LaunchWrapperDescriptor("codex"));
IntegrationRegistry.register(new LaunchWrapperDescriptor("aider"));
IntegrationRegistry.register(new LaunchWrapperDescriptor("gemini"));
IntegrationRegistry.register(new LaunchWrapperDescriptor("ollama"));

