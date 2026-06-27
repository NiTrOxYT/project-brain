// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — retrieve command
// brain retrieve  →  Run Context Retrieval
// ──────────────────────────────────────────────────────────────────────────────
import { logger } from "../utils/logger.js";
import { printJson } from "../utils/json.js";
import { Spinner } from "../utils/spinner.js";
import { requireBrainInitialized } from "../utils/paths.js";
import { ValidationError } from "../utils/errors.js";
export async function runRetrieve(opts, cmdOpts) {
    requireBrainInitialized(opts.workspace);
    if (!cmdOpts.query) {
        throw new ValidationError("--query is required");
    }
    const { ContextRetrievalService } = await import("../../context-retrieval/service.js");
    const spinner = new Spinner("Retrieving context...");
    spinner.start();
    const t0 = Date.now();
    try {
        const svc = new ContextRetrievalService(opts.project, opts.workspace);
        const result = await svc.retrieve({
            query: cmdOpts.query,
            maxTokens: cmdOpts.budget,
            providerId: cmdOpts.provider,
        });
        const ms = Date.now() - t0;
        // RetrievalPackage has sections; estimate total tokens from sections
        const totalTokens = result.retrievalPackage.sections.reduce((acc, s) => acc + (s.estimatedTokens ?? 0), 0);
        if (opts.json) {
            spinner.stop();
            printJson({
                ok: true,
                sections: result.retrievalPackage.sections.length,
                tokens: totalTokens,
                cacheHit: result.cacheHit,
                durationMs: ms,
                package: result.retrievalPackage,
            });
        }
        else {
            spinner.succeed("Context retrieved");
            logger.log(`  Sections:  ${result.retrievalPackage.sections.length}`);
            logger.log(`  Tokens:    ${totalTokens}`);
            logger.log(`  Cache:     ${result.cacheHit ? "hit" : "miss"}`);
            logger.log(`  Duration:  ${ms} ms`);
            if (opts.verbose) {
                logger.blank();
                for (const sec of result.retrievalPackage.sections) {
                    logger.log(`  [${sec.kind}] ${sec.name}  (${sec.estimatedTokens} tokens)`);
                }
            }
        }
    }
    catch (err) {
        spinner.fail("Retrieval failed");
        throw err;
    }
}
