export class BrainError extends Error {
    constructor(message) {
        super(message);
        this.name = "BrainError";
    }
}
