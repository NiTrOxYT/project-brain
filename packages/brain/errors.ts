export class BrainError extends Error {

    constructor(message: string) {

        super(message);

        this.name = "BrainError";

    }

}
