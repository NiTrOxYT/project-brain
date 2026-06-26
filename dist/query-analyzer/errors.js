export class QueryAnalyzerError extends Error {
    constructor(message) {
        super(message);
        this.name = "QueryAnalyzerError";
    }
}
