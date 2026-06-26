export class OrchestratorError extends Error {
    constructor(message) {
        super(message);
        this.name = "OrchestratorError";
    }
}
