import { AgentRegistry } from "./registry.js";
import { RuntimeRequest, RuntimeResponse, RuntimeEvent } from "./types.js";
import { AgentRuntimeError } from "./errors.js";

export class RuntimeEngine {
    constructor(private readonly registry: AgentRegistry) {}

    async execute(
        request: RuntimeRequest,
        onEvent: (event: RuntimeEvent) => void
    ): Promise<RuntimeResponse> {
        const { task, context } = request;

        const providers = this.registry.discover(task.type);
        if (providers.length === 0) {
            throw new AgentRuntimeError(`No registered provider supports task capability: ${task.type}`);
        }

        // Deterministic provider selection (picks the first matched provider)
        const provider = providers[0];
        
        try {
            return await provider.execute(task, context, onEvent);
        } catch (error: any) {
            throw new AgentRuntimeError(`Execution failed on provider "${provider.name}": ${error.message}`);
        }
    }
}
