export class RetrieverError extends Error {
    constructor(message) {
        super(message);
        this.name = "RetrieverError";
    }
}
