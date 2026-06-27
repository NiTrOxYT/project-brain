import type { RuntimeEnvironment, IntegrationDescriptor } from "./integration.js";
import { IntegrationRegistry } from "./registry.js";

export class IntegrationNegotiator {
    static async negotiate(
        providerId: string,
        environment: RuntimeEnvironment
    ): Promise<IntegrationDescriptor | undefined> {
        const matches = IntegrationRegistry.list().filter(d => d.providerId === providerId);
        const candidates: { descriptor: IntegrationDescriptor; priority: number }[] = [];

        for (const desc of matches) {
            const support = await desc.supports(environment);
            if (support.supported) {
                candidates.push({ descriptor: desc, priority: desc.priority });
            }
        }

        candidates.sort((a, b) => b.priority - a.priority);
        return candidates.length > 0 ? candidates[0].descriptor : undefined;
    }
}
