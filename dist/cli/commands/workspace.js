// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — workspace command
// brain workspace <subcommand>
// ──────────────────────────────────────────────────────────────────────────────
import { logger } from "../utils/logger.js";
import { printJson } from "../utils/json.js";
import { Spinner } from "../utils/spinner.js";
import { renderTable, renderKeyValue } from "../utils/table.js";
import { requireBrainInitialized } from "../utils/paths.js";
import { ValidationError } from "../utils/errors.js";
import { bold } from "../utils/colors.js";
import { StoragePaths } from "../../kernel/paths.js";
export async function runWorkspaceCmd(opts, sub, cmdOpts) {
    requireBrainInitialized(opts.workspace);
    const paths = new StoragePaths(opts.workspace);
    const { WorkspaceEngine } = await import("../../workspace/workspace-engine.js");
    const engine = new WorkspaceEngine({ workspaceRoot: opts.workspace });
    const spinner = new Spinner("Loading workspace...");
    spinner.start();
    try {
        switch (sub) {
            case "status": {
                // diagnostics() is the main status method
                const status = engine.diagnostics();
                spinner.stop();
                if (opts.json) {
                    printJson({ ok: true, status });
                }
                else {
                    logger.log(bold("Workspace Status"));
                    logger.log(renderKeyValue(Object.entries(status).map(([k, v]) => [k, String(v)])));
                }
                break;
            }
            case "transactions": {
                const stagedMap = engine.staged ?? new Map();
                const txns = Array.from(stagedMap.values());
                spinner.stop();
                if (opts.json) {
                    printJson({ ok: true, transactions: txns });
                }
                else {
                    if (txns.length === 0) {
                        logger.log("No active transactions.");
                    }
                    else {
                        logger.log(renderTable([
                            { header: "ID", key: "id", width: 36 },
                            { header: "Status", key: "status", width: 12 },
                            { header: "Ops", key: "ops", width: 6, align: "right" },
                        ], txns.map((t) => ({
                            id: t.tx?.id ?? "", status: t.status ?? "", ops: String(t.operations?.length ?? 0)
                        }))));
                    }
                }
                break;
            }
            case "locks": {
                const locks = engine.locks?.activeLocks() ?? [];
                spinner.stop();
                if (opts.json) {
                    printJson({ ok: true, locks });
                }
                else {
                    if (locks.length === 0) {
                        logger.log("No active locks.");
                    }
                    else {
                        logger.log(renderTable([
                            { header: "Path", key: "path", width: 50 },
                            { header: "Tx ID", key: "txId", width: 36 },
                            { header: "Mode", key: "mode", width: 10 },
                        ], locks.map((l) => ({ path: l.path ?? "", txId: l.transactionId ?? "", mode: l.mode ?? "" }))));
                    }
                }
                break;
            }
            case "journal": {
                const { WorkspaceJournal } = await import("../../workspace/workspace-journal.js");
                const journal = new WorkspaceJournal(paths.journalDir);
                const entries = journal.readAll().slice(-50);
                spinner.stop();
                if (opts.json) {
                    printJson({ ok: true, entries });
                }
                else {
                    logger.log(bold(`Journal (last ${entries.length} entries)`));
                    logger.log(renderTable([
                        { header: "Tx ID", key: "txId", width: 36 },
                        { header: "Action", key: "action", width: 20 },
                        { header: "Time", key: "time", width: 26 },
                    ], entries.map((e) => ({
                        txId: e.transactionId ?? "", action: e.action ?? "", time: e.timestamp ?? ""
                    }))));
                }
                break;
            }
            case "rollback": {
                const txId = cmdOpts["tx"];
                if (!txId)
                    throw new ValidationError("--tx <transaction-id> is required");
                await engine.rollback(txId);
                spinner.stop();
                if (opts.json) {
                    printJson({ ok: true, rolledBack: txId });
                }
                else {
                    logger.log(`Rolled back transaction: ${txId}`);
                }
                break;
            }
            default: throw new ValidationError(`Unknown workspace subcommand: ${sub}`);
        }
    }
    catch (err) {
        spinner.stop();
        throw err;
    }
}
