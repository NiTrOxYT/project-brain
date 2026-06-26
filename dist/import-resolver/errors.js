export class ImportResolverError extends Error {
    constructor(message) {
        super(message);
        this.name = "ImportResolverError";
    }
}
