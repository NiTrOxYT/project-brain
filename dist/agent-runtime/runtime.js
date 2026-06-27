import { AgentRuntimeError } from "./errors.js";
export class RuntimeEngine {
    registry;
    constructor(registry) {
        this.registry = registry;
    }
    async execute(request, onEvent) {
        const { task, context } = request;
        const providers = this.registry.discover(task.type);
        if (providers.length === 0) {
            throw new AgentRuntimeError(`No registered provider supports task capability: ${task.type}`);
        }
        // Deterministic provider selection (picks the first matched provider)
        const provider = providers[0];
        try {
            return await provider.execute(task, context, onEvent);
        }
        catch (error) {
            throw new AgentRuntimeError(`Execution failed on provider "${provider.name}": ${error.message}`);
        }
    }
}
