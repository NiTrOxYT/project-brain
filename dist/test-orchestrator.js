import process from "process";
import { OrchestratorService } from "./orchestrator";
async function main() {
    const runtime = new OrchestratorService(process.cwd() + "/.brain");
    const result = await runtime.execute({
        query: "runtime"
    });
    console.dir(result, {
        depth: null
    });
}
main();
