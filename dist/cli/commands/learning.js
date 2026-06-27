// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — learning command
// brain learning <subcommand>
// ──────────────────────────────────────────────────────────────────────────────
import { logger } from "../utils/logger.js";
import { printJson } from "../utils/json.js";
import { Spinner } from "../utils/spinner.js";
import { requireBrainInitialized } from "../utils/paths.js";
import { ValidationError } from "../utils/errors.js";
import { bold } from "../utils/colors.js";
export async function runLearning(opts, sub, cmdOpts) {
    requireBrainInitialized(opts.workspace);
    const { LearningEngineService } = await import("../../learning-engine/service.js");
    const svc = new LearningEngineService(opts.workspace);
    const spinner = new Spinner("Loading learning engine...");
    spinner.start();
    try {
        switch (sub) {
            case "learn": {
                const eventPath = cmdOpts["event"];
                if (!eventPath)
                    throw new ValidationError("--event <path-to-event-json> is required");
                const fs = await import("fs");
                const event = JSON.parse(fs.readFileSync(eventPath, "utf-8"));
                await svc.learn(event);
                spinner.stop();
                if (opts.json) {
                    printJson({ ok: true, status: "learned" });
                }
                else {
                    logger.log(`\x1b[32m✔\x1b[0m Learning event processed.`);
                }
                break;
            }
            case "recommend": {
                const query = cmdOpts["query"];
                if (!query)
                    throw new ValidationError("--query is required");
                // LearningRequest: { taskType, taskTitle, ... }
                const recs = await svc.recommend({ taskType: "query", taskTitle: query });
                spinner.stop();
                if (opts.json) {
                    printJson({ ok: true, recommendations: recs });
                }
                else {
                    logger.log(bold("Recommendations"));
                    logger.log(JSON.stringify(recs, null, 2));
                }
                break;
            }
            case "statistics": {
                const stats = await svc.statistics();
                spinner.stop();
                if (opts.json) {
                    printJson({ ok: true, statistics: stats });
                }
                else {
                    logger.log(bold("Learning Statistics"));
                    logger.log(JSON.stringify(stats, null, 2));
                }
                break;
            }
            default: throw new ValidationError(`Unknown learning subcommand: ${sub}`);
        }
    }
    catch (err) {
        spinner.stop();
        throw err;
    }
}
