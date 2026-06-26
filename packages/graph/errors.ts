export class GraphError extends Error {

    constructor(message: string) {

        super(message);

        this.name = "GraphError";

    }

}
