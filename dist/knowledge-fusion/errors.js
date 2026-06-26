export class KnowledgeFusionError extends Error {
    constructor(message) {
        super(message);
        this.name = "KnowledgeFusionError";
    }
}
