export class QueryEngineError extends Error {
    constructor(message) {
        super(message);
        this.name = "QueryEngineError";
    }
}
