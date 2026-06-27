import { QueryAnalyzerService } from "./query-analyzer/index.js";

const analyzer =
    new QueryAnalyzerService();

console.dir(

    analyzer.analyze(
        "Add authentication middleware"
    ),

    { depth: null }

);
