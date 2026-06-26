export class SynchronizerError extends Error {

    constructor(message: string) {

        super(message);

        this.name = "SynchronizerError";

    }

}
