// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — query command
// brain query  →  Run Query Engine
// ──────────────────────────────────────────────────────────────────────────────

import { GlobalOptions } from "../main.js";
import { logger } from "../utils/logger.js";
import { printJson } from "../utils/json.js";
import { Spinner } from "../utils/spinner.js";
import { requireBrainInitialized } from "../utils/paths.js";
import { ValidationError } from "../utils/errors.js";

export interface QueryOptions {
    query?: string;
    format?: "json" | "text";
}

export async function runQuery(opts: GlobalOptions, cmdOpts: QueryOptions): Promise<void> {
    requireBrainInitialized(opts.workspace);

    if (!cmdOpts.query) {
        throw new ValidationError("--query is required");
    }

    const { QueryEngineService } = await import("../../query-engine/service.js");

    const spinner = new Spinner("Querying...");
    spinner.start();
    const t0 = Date.now();

    try {
        const svc = new QueryEngineService(opts.project, opts.workspace);
        const result = await svc.query({ query: cmdOpts.query });
        const ms = Date.now() - t0;

        const fmt = cmdOpts.format ?? (opts.json ? "json" : "text");

        if (fmt === "json" || opts.json) {
            spinner.stop();
            printJson({ ok: true, result, durationMs: ms });
        } else {
            spinner.succeed("Query complete");
            logger.log(`  Duration:  ${ms} ms`);
            logger.blank();
            logger.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
        }
    } catch (err) {
        spinner.fail("Query failed");
        throw err;
    }
}
