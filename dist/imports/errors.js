export class ImportsError extends Error {
    constructor(message) {
        super(message);
        this.name = "ImportsError";
    }
}
