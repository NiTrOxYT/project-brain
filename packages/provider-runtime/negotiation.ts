// ──────────────────────────────────────────────────────────────────────────────
// BUILD-049 — Provider Runtime — Capability & Model Negotiation
// Pure, stateless, deterministic. Same inputs → same outputs always.
// ──────────────────────────────────────────────────────────────────────────────

import { AgentCapability } from "../agent-runtime/types";
import { SDKProvider } from "./provider";
import { NegotiationResult, NegotiationContext, ProviderHealthReport, ProviderHealth } from "./types";
import { ProviderNegotiationError } from "./errors";

// Healthy-or-degraded providers are usable; Busy is usable with lower score
const HEALTH_SCORE: Record<ProviderHealth, number> = {
    "Healthy":     10,
    "Busy":         5,
    "Degraded":     2,
    "Unavailable":  0,
    "Offline":      0
};

export class CapabilityNegotiator {
    /**
     * Deterministic negotiation algorithm.
     * Selection order:
     *   1. Supports required capability
     *   2. Healthy (Offline / Unavailable excluded)
     *   3. Highest priority (from metadata)
     *   4. Highest version (semver major.minor comparison)
     *   5. Registration order (preserved from registry sort)
     *   6. Alphabetical provider ID
     *
     * Returns the winner + full fallback chain (in priority order).
     * Health reports are optional — if absent, assumes Healthy.
     */
    negotiate(
        candidates: SDKProvider[],
        ctx: NegotiationContext,
        healthReports?: Map<string, ProviderHealthReport>
    ): NegotiationResult {
        if (candidates.length === 0) {
            throw new ProviderNegotiationError(
                ctx.capability,
                "No providers registered for this capability"
            );
        }

        // Score each candidate
        const scored = candidates.map(p => {
            const meta = p.metadata();
            const health = healthReports?.get(p.id)?.status ?? "Healthy";
            const hScore = HEALTH_SCORE[health] ?? 0;

            // Skip completely unavailable providers
            const usable = hScore > 0;

            return {
                provider: p,
                meta,
                health,
                hScore,
                usable,
                versionScore: this.versionScore(meta.version)
            };
        });

        // Separate usable from unusable
        const usable = scored.filter(s => s.usable);
        if (usable.length === 0) {
            throw new ProviderNegotiationError(
                ctx.capability,
                "All registered providers are offline or unavailable"
            );
        }

        // Sort usable: health score → priority → version → alphabetical ID
        usable.sort((a, b) => {
            if (a.hScore !== b.hScore) return b.hScore - a.hScore;
            if (a.meta.priority !== b.meta.priority) return b.meta.priority - a.meta.priority;
            if (a.versionScore !== b.versionScore) return b.versionScore - a.versionScore;
            return (a.meta.id || a.provider.id).localeCompare(b.meta.id || b.provider.id);
        });

        const winner = usable[0];
        const selectedModel = this.negotiateModel(winner.provider, ctx);
        const fallbackChain = usable.slice(1).map(s => s.meta.id || s.provider.id);

        const capabilityScore = this.computeCapabilityScore(winner.provider, ctx);

        const selectionReason = [
            `Selected '${winner.meta.displayName}' (${winner.meta.id || winner.provider.id})`,
            `health=${winner.health}`,
            `priority=${winner.meta.priority}`,
            `version=${winner.meta.version}`,
            `model=${selectedModel}`,
            `capability='${ctx.capability}'`
        ].join(", ");

        return {
            selectedProvider: winner.meta.id || winner.provider.id,
            selectedModel,
            fallbackChain,
            selectionReason,
            capabilityScore,
            negotiatedAt: new Date().toISOString()
        };
    }

    /**
     * Deterministic model negotiation.
     * If ctx.preferredModel matches a supported model → use it.
     * Otherwise → use defaultModel.
     */
    negotiateModel(provider: SDKProvider, ctx: NegotiationContext): string {
        const meta = provider.metadata();
        if (ctx.preferredModel && meta.supportedModels.includes(ctx.preferredModel)) {
            return ctx.preferredModel;
        }
        return meta.defaultModel;
    }

    private versionScore(version?: string): number {
        if (!version) return 0;
        const parts = version.replace(/^[v~^]/, "").split(".").map(Number);
        const [major = 0, minor = 0, patch = 0] = parts;
        return major * 10000 + minor * 100 + patch;
    }

    private computeCapabilityScore(provider: SDKProvider, ctx: NegotiationContext): number {
        const caps = provider.capabilities();
        const allCaps: AgentCapability[] = [
            "analyze", "create", "modify", "refactor", "delete",
            "validate", "document", "test", "cleanup"
        ];
        // Score = fraction of total known capabilities supported
        const supported = allCaps.filter(c => caps.includes(c)).length;
        return parseFloat((supported / allCaps.length).toFixed(2));
    }
}
