export class GraphError extends Error {
    constructor(message) {
        super(message);
        this.name = "GraphError";
    }
}
