export class AstError extends Error {
    constructor(message) {
        super(message);
        this.name = "AstError";
    }
}
