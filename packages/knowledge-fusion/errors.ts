export class KnowledgeFusionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "KnowledgeFusionError";
    }
}
