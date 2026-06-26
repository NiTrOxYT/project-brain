export class AgentRuntimeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AgentRuntimeError";
    }
}
