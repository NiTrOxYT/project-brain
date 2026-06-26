export class AgentRuntimeError extends Error {
    constructor(message) {
        super(message);
        this.name = "AgentRuntimeError";
    }
}
