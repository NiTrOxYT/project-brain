export class AstError extends Error {

    constructor(message: string) {

        super(message);

        this.name = "AstError";

    }

}
