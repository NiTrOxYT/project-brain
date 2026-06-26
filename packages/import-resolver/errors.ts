export class ImportResolverError extends Error {

    constructor(message: string) {

        super(message);

        this.name = "ImportResolverError";

    }

}
