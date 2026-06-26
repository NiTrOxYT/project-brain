export class RelationshipAnalyzerError extends Error {
    constructor(message) {
        super(message);
        this.name = "RelationshipAnalyzerError";
    }
}
