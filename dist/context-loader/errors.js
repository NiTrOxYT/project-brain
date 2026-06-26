export class ContextLoaderError extends Error {
    constructor(message) {
        super(message);
        this.name = "ContextLoaderError";
    }
}
