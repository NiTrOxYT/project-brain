// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — runtime command
// brain runtime <subcommand>
// ──────────────────────────────────────────────────────────────────────────────

import { GlobalOptions } from "../main.js";
import { logger } from "../utils/logger.js";
import { printJson } from "../utils/json.js";
import { Spinner } from "../utils/spinner.js";
import { requireBrainInitialized } from "../utils/paths.js";
import { ValidationError } from "../utils/errors.js";
import { bold } from "../utils/colors.js";

type RuntimeSubcmd = "execute" | "resume" | "status";

export async function runRuntime(
    opts: GlobalOptions,
    sub: RuntimeSubcmd,
    cmdOpts: Record<string, unknown>
): Promise<void> {
    requireBrainInitialized(opts.workspace);

    const { AutonomousRuntimeService } = await import("../../autonomous-runtime/service.js");

    switch (sub) {
        case "execute": {
            const planPath = (cmdOpts["plan"] as string | undefined);
            if (!planPath) throw new ValidationError("--plan <path> is required");

            const fs = await import("fs");
            if (!fs.existsSync(planPath)) throw new ValidationError(`Plan file not found: ${planPath}`);

            const plan = JSON.parse(fs.readFileSync(planPath, "utf-8"));
            const spinner = new Spinner("Executing plan...");
            spinner.start();
            const t0 = Date.now();

            try {
                const svc = new AutonomousRuntimeService({
                    plan,
                    projectRoot: opts.project,
                    workspaceRoot: opts.workspace,
                });
                const result = await svc.execute();
                const ms = Date.now() - t0;
                const ok = result.status === "Completed";

                if (opts.json) {
                    spinner.stop();
                    printJson({ ok, status: result.status, durationMs: ms });
                } else {
                    ok ? spinner.succeed(`Execution completed (${ms} ms)`) : spinner.fail(`Execution ${result.status}`);
                }
            } catch (err) {
                spinner.fail("Execution failed");
                throw err;
            }
            break;
        }

        case "status": {
            if (opts.json) {
                printJson({ ok: true, status: "idle" });
            } else {
                logger.log(bold("Runtime Status: ") + "no active execution");
            }
            break;
        }

        case "resume": {
            if (opts.json) {
                printJson({ ok: false, error: "not implemented" });
            } else {
                logger.log("Resume: checkpoint-based resume not yet implemented for standalone runtime.");
            }
            break;
        }

        default: throw new ValidationError(`Unknown runtime subcommand: ${sub}`);
    }
}
