export class GraphTraversalError extends Error {

    constructor(message: string) {

        super(message);

        this.name = "GraphTraversalError";

    }

}
