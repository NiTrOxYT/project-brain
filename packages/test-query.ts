import { QueryAnalyzerService } from "./query-analyzer";

const analyzer =
    new QueryAnalyzerService();

console.dir(

    analyzer.analyze(
        "Add authentication middleware"
    ),

    { depth: null }

);
