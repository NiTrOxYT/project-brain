export class ManifestError extends Error {

    constructor(message: string) {

        super(message);

        this.name = "ManifestError";

    }

}
