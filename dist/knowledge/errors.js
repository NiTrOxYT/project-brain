export class KnowledgeError extends Error {
    constructor(message) {
        super(message);
        this.name = "KnowledgeError";
    }
}
