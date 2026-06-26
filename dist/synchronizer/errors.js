export class SynchronizerError extends Error {
    constructor(message) {
        super(message);
        this.name = "SynchronizerError";
    }
}
