// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — compile command
// brain compile  →  Run Context Compiler
// ──────────────────────────────────────────────────────────────────────────────
import { logger } from "../utils/logger.js";
import { printJson } from "../utils/json.js";
import { Spinner } from "../utils/spinner.js";
import { requireBrainInitialized } from "../utils/paths.js";
export async function runCompile(opts, cmdOpts) {
    requireBrainInitialized(opts.workspace);
    const { ContextCompilerService } = await import("../../context-compiler/service.js");
    const compile = async () => {
        const spinner = new Spinner("Compiling context...");
        spinner.start();
        const t0 = Date.now();
        try {
            const svc = new ContextCompilerService(opts.project, opts.workspace);
            const result = await svc.compile({
                projectRoot: opts.project,
                workspaceRoot: opts.workspace,
                force: cmdOpts.force ?? false,
            });
            const ms = Date.now() - t0;
            if (opts.json) {
                spinner.stop();
                printJson({
                    ok: true,
                    snapshotId: result.snapshot.snapshotId,
                    files: result.snapshot.files.length,
                    symbols: result.snapshot.symbols.length,
                    durationMs: ms,
                    cacheHit: result.cacheHit,
                });
            }
            else {
                spinner.succeed("Context compiled");
                logger.log(`  Snapshot:  ${result.snapshot.snapshotId}`);
                logger.log(`  Files:     ${result.snapshot.files.length}`);
                logger.log(`  Symbols:   ${result.snapshot.symbols.length}`);
                logger.log(`  Duration:  ${ms} ms`);
                if (result.cacheHit)
                    logger.log(`  Cache:     hit`);
            }
        }
        catch (err) {
            spinner.fail("Compilation failed");
            throw err;
        }
    };
    await compile();
    if (cmdOpts.watch) {
        if (!opts.json)
            logger.log(`\n\x1b[32m✔\x1b[0m Watching for changes... (Ctrl-C to stop)`);
        const { WorkspaceListener } = await import("../../context-sync/workspace-listener.js");
        const listener = new WorkspaceListener(async (req) => {
            if (!opts.json)
                logger.log("\nChange detected — recompiling...");
            await compile();
            return { snapshot: null, metrics: null, stages: [], cacheHit: false };
        });
        listener.start();
        await new Promise(resolve => {
            process.on("SIGINT", () => { listener.stop(); resolve(); });
            process.on("SIGTERM", () => { listener.stop(); resolve(); });
        });
    }
}
