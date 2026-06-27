export class IntegrationRegistry {
    static descriptors = [];
    static register(desc) {
        if (!this.descriptors.find(d => d.id === desc.id)) {
            this.descriptors.push(desc);
        }
    }
    static list() {
        return this.descriptors;
    }
    static clear() {
        this.descriptors = [];
    }
}
export class ActiveBridgeRegistry {
    static bridges = new Map();
    static register(providerId, bridge) {
        this.bridges.set(providerId, bridge);
    }
    static get(providerId) {
        return this.bridges.get(providerId);
    }
    static remove(providerId) {
        this.bridges.delete(providerId);
    }
    static clear() {
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
