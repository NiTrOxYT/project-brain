export class GraphBuilderError extends Error {
    constructor(message) {
        super(message);
        this.name = "GraphBuilderError";
    }
}
