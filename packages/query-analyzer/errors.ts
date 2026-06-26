export class QueryAnalyzerError extends Error {

    constructor(message: string) {

        super(message);

        this.name = "QueryAnalyzerError";

    }

}
