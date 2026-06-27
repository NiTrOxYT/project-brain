// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — sync command
// brain sync  →  Run Context Synchronization
// ──────────────────────────────────────────────────────────────────────────────

import { GlobalOptions } from "../main.js";
import { logger } from "../utils/logger.js";
import { printJson } from "../utils/json.js";
import { Spinner } from "../utils/spinner.js";
import { requireBrainInitialized } from "../utils/paths.js";

export interface SyncOptions {
    full?: boolean;
    incremental?: boolean;
}

export async function runSync(opts: GlobalOptions, cmdOpts: SyncOptions): Promise<void> {
    requireBrainInitialized(opts.workspace);

    const { ContextSynchronizationService } = await import("../../context-sync/service.js");

    const spinner = new Spinner("Synchronizing context...");
    spinner.start();
    const t0 = Date.now();

    try {
        const svc = new ContextSynchronizationService(opts.project, opts.workspace);
        const result = await svc.sync({
            projectRoot: opts.project,
            workspaceRoot: opts.workspace,
            forceFullSync: cmdOpts.full ?? false,
        });
        svc.destroy();
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
        } else {
            spinner.succeed("Context synchronized");
            logger.log(`  Snapshot:  ${result.snapshot.snapshotId}`);
            logger.log(`  Files:     ${result.snapshot.files.length}`);
            logger.log(`  Symbols:   ${result.snapshot.symbols.length}`);
            logger.log(`  Duration:  ${ms} ms`);
        }
    } catch (err) {
        spinner.fail("Sync failed");
        throw err;
    }
}
