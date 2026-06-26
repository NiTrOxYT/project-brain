export class ManifestError extends Error {
    constructor(message) {
        super(message);
        this.name = "ManifestError";
    }
}
