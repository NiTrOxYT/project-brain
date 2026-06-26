export class ScannerError extends Error {
    constructor(message) {
        super(message);
        this.name = "ScannerError";
    }
}
