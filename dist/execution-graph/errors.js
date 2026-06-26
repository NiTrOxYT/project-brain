export class ExecutionGraphError extends Error {
    constructor(message) {
        super(message);
        this.name = "ExecutionGraphError";
    }
}
