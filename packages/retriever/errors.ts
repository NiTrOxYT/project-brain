export class RetrieverError extends Error {

    constructor(message: string) {

        super(message);

        this.name = "RetrieverError";

    }

}
