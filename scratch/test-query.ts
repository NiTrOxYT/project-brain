import { QueryEngineService } from "../packages/query-engine/service";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_WORKSPACE = path.join(__dirname, "..", ".brain-test-context-retrieval");

async function main() {
    const queryService = new QueryEngineService(TEST_WORKSPACE, TEST_WORKSPACE);
    const res = await queryService.query({ query: "fix main" });
    console.log("Query result diagnostics:", res.diagnostics);
}

main().catch(console.error);
