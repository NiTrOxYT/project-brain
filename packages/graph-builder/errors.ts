export class GraphBuilderError extends Error {

    constructor(message: string) {

        super(message);

        this.name = "GraphBuilderError";

    }

}
