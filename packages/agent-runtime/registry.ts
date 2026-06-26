import { AgentProvider } from "./provider";
import { AgentDescriptor, AgentCapability } from "./types";
import { AgentRuntimeError } from "./errors";

const RUNTIME_VERSION = "1.0.0";

function isCompatible(providerVersion?: string, runtimeVersion = RUNTIME_VERSION): boolean {
    if (!providerVersion) return true;
    const cleanProvider = providerVersion.replace(/^[~^]/, "");
    const pMajor = cleanProvider.split(".")[0];
    const rMajor = runtimeVersion.split(".")[0];
    return pMajor === rMajor;
}

export class AgentRegistry {
    private readonly providers = new Map<string, AgentProvider>();
    private readonly registrationInfo = new Map<string, { index: number; timestamp: string }>();
    private nextRegistrationIndex = 0;

    register(provider: AgentProvider): void {
        if (!provider || !provider.id) {
            throw new AgentRuntimeError("Cannot register provider: invalid provider definition");
        }
        this.providers.set(provider.id, provider);
        this.registrationInfo.set(provider.id, {
            index: this.nextRegistrationIndex++,
            timestamp: new Date().toISOString()
        });
    }

    unregister(id: string): void {
        this.providers.delete(id);
        this.registrationInfo.delete(id);
    }

    get(id: string): AgentProvider | undefined {
        return this.providers.get(id);
    }

    list(): AgentDescriptor[] {
        return Array.from(this.providers.values()).map(p => {
            const info = this.registrationInfo.get(p.id);
            return {
                id: p.id,
                name: p.name,
                capabilities: p.capabilities,
                priority: p.priority ?? 0,
                version: p.version || "1.0.0",
                supportedRuntimeVersion: p.supportedRuntimeVersion || "1.0.0",
                health: p.health || "Healthy",
                registeredAt: info?.timestamp,
                metadata: p.metadata || {}
            };
        });
    }

    discover(capability: AgentCapability): AgentProvider[] {
        // Filter by capability support, health, and runtime compatibility (negotiation)
        const matches = Array.from(this.providers.values()).filter(p => {
            // 1. Capability support
            if (!p.supportsCapability(capability)) return false;
            // 2. Provider health/availability (skip Offline)
            if (p.health === "Offline") return false;
            // 3. Runtime compatibility
            if (!isCompatible(p.supportedRuntimeVersion)) return false;
            return true;
        });

        // Deterministic sorting order
        return matches.sort((a, b) => {
            // 1. Highest priority
            const priorityA = a.priority ?? 0;
            const priorityB = b.priority ?? 0;
            if (priorityA !== priorityB) {
                return priorityB - priorityA;
            }

            // 2. Lowest registration order (earlier registered first)
            const regA = this.registrationInfo.get(a.id)!;
            const regB = this.registrationInfo.get(b.id)!;
            if (regA.index !== regB.index) {
                return regA.index - regB.index;
            }

            // 3. Alphabetical provider ID
            return a.id.localeCompare(b.id);
        });
    }
}
