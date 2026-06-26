export class ContextLoaderError extends Error {

    constructor(message: string) {

        super(message);

        this.name = "ContextLoaderError";

    }

}
