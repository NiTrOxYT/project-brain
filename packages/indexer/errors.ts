export class IndexerError extends Error {

    constructor(message: string) {

        super(message);

        this.name = "IndexerError";

    }

}
