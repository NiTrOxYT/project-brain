export class KnowledgeError extends Error {

    constructor(message: string) {

        super(message);

        this.name = "KnowledgeError";

    }

}
