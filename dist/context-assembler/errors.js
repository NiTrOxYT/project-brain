export class ContextAssemblerError extends Error {
    constructor(message) {
        super(message);
        this.name = "ContextAssemblerError";
    }
}
