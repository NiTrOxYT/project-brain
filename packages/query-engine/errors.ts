export class QueryEngineError extends Error {

    constructor(message: string) {

        super(message);

        this.name = "QueryEngineError";

    }

}
