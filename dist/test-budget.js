import process from "process";
import { PlannerService } from "./planner";
import { RetrieverService } from "./retriever";
import { ContextBudgetService } from "./context-budget";
async function main() {
    const workspace = process.cwd() + "/.brain";
    const planner = new PlannerService(workspace);
    const retriever = new RetrieverService(workspace);
    const budgeter = new ContextBudgetService();
    const plan = await planner.plan("Fix runtime initialization error");
    const retrieval = await retriever.retrieve({
        query: plan.keywords.join(" "),
        limit: 20
    });
    const candidates = retrieval.files.map(file => ({
        path: file.path,
        score: file.score,
        estimatedTokens: 300,
        symbols: 10
    }));
    const result = budgeter.budget({
        candidates,
        maxTokens: 3000
    });
    console.dir(result, {
        depth: null
    });
}
main().catch(console.error);
