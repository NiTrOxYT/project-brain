// ──────────────────────────────────────────────────────────────────────────────
// BUILD-049 — Provider Runtime — Registry
// Deterministic provider registry with ordered registration and discovery.
// ──────────────────────────────────────────────────────────────────────────────

import { AgentCapability } from "../agent-runtime/types";
import { SDKProvider } from "./provider";
import { ProviderProfile, NegotiationResult, NegotiationContext } from "./types";
import { ProviderNotFoundError, ProviderRuntimeError } from "./errors";
import { CapabilityNegotiator } from "./negotiation";

interface RegistrationRecord {
    provider: SDKProvider;
    registeredAt: string;
    registrationIndex: number;
}

export class ProviderRegistry {
    private readonly records = new Map<string, RegistrationRecord>();
    private nextIndex = 0;
    private readonly negotiator = new CapabilityNegotiator();

    /**
     * Register a provider. Later registration does not override priority.
     * Throws if provider with same ID already registered.
     */
    register(provider: SDKProvider): void {
        if (!provider || !provider.id) {
            throw new ProviderRuntimeError("Cannot register provider: missing id");
        }
        if (this.records.has(provider.id)) {
            // Allow re-registration (update)
            const existing = this.records.get(provider.id)!;
            this.records.set(provider.id, {
                provider,
                registeredAt: existing.registeredAt,
                registrationIndex: existing.registrationIndex
            });
            return;
        }
        this.records.set(provider.id, {
            provider,
            registeredAt: new Date().toISOString(),
            registrationIndex: this.nextIndex++
        });
    }

    unregister(id: string): void {
        this.records.delete(id);
    }

    get(id: string): SDKProvider | undefined {
        return this.records.get(id)?.provider;
    }

    /**
     * List all registered providers sorted deterministically:
     * highest priority → lowest registration index → alphabetical ID.
     */
    list(): SDKProvider[] {
        return this.sortedProviders();
    }

    /**
     * Discover providers that support the given capability.
     * Returns sorted list (does NOT filter by health — caller decides).
     */
    discover(capability: AgentCapability): SDKProvider[] {
        return this.sortedProviders().filter(p => p.supportsCapability(capability));
    }

    /**
     * Negotiate the best provider for a given context.
     * Returns full NegotiationResult including fallback chain.
     */
    async negotiate(ctx: NegotiationContext): Promise<NegotiationResult> {
        const candidates = this.discover(ctx.capability);
        return this.negotiator.negotiate(candidates, ctx);
    }

    /** Total registered provider count. */
    get size(): number {
        return this.records.size;
    }

    private sortedProviders(): SDKProvider[] {
        const entries = Array.from(this.records.values());
        return entries
            .map(r => r.provider)
            .sort((a, b) => {
                const metaA = a.metadata();
                const metaB = b.metadata();

                // 1. Highest priority
                if (metaA.priority !== metaB.priority) {
                    return metaB.priority - metaA.priority;
                }

                // 2. Lowest registration index (earlier registered wins)
                const recA = this.records.get(a.id)!;
                const recB = this.records.get(b.id)!;
                if (recA.registrationIndex !== recB.registrationIndex) {
                    return recA.registrationIndex - recB.registrationIndex;
                }

                // 3. Alphabetical ID
                return a.id.localeCompare(b.id);
            });
    }
}
