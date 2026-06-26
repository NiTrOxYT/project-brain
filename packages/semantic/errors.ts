export class SemanticError extends Error {

    constructor(message: string) {

        super(message);

        this.name = "SemanticError";

    }

}
