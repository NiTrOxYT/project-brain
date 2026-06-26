export class IndexerError extends Error {
    constructor(message) {
        super(message);
        this.name = "IndexerError";
    }
}
