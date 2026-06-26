export class GraphTraversalError extends Error {
    constructor(message) {
        super(message);
        this.name = "GraphTraversalError";
    }
}
