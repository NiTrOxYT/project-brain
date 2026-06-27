// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — context command
// brain context <subcommand>
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import { logger } from "../utils/logger.js";
import { printJson } from "../utils/json.js";
import { Spinner } from "../utils/spinner.js";
import { renderTable, renderKeyValue } from "../utils/table.js";
import { requireBrainInitialized } from "../utils/paths.js";
import { ValidationError } from "../utils/errors.js";
import { bold, gray } from "../utils/colors.js";
import { StoragePaths } from "../../kernel/paths.js";
export async function runContext(opts, sub, cmdOpts) {
    requireBrainInitialized(opts.workspace);
    const paths = new StoragePaths(opts.workspace);
    const { ContextSynchronizationService } = await import("../../context-sync/service.js");
    const svc = new ContextSynchronizationService(opts.project, opts.workspace);
    const spinner = new Spinner("Loading context...");
    spinner.start();
    try {
        switch (sub) {
            case "latest": {
                const snap = await svc.latestSnapshot();
                spinner.stop();
                if (!snap) {
                    if (opts.json)
                        printJson({ ok: true, snapshot: null });
                    else
                        logger.log(gray("No snapshot found. Run: brain compile"));
                    break;
                }
                if (opts.json) {
                    printJson({ ok: true, snapshot: snap });
                }
                else {
                    logger.log(renderKeyValue([
                        ["ID", snap.snapshotId],
                        ["Files", String(snap.files.length)],
                        ["Symbols", String(snap.symbols.length)],
                        ["Compiled", snap.metadata.compiledAt ?? ""],
                    ]));
                }
                break;
            }
            case "list": {
                // Read snapshots from .brain/snapshots directory
                const snapDir = paths.snapshotsDir;
                const refs = [];
                if (fs.existsSync(snapDir)) {
                    const files = fs.readdirSync(snapDir).filter(f => f.endsWith(".json") && f !== "index.json");
                    for (const f of files.slice(-20)) {
                        try {
                            const snap = JSON.parse(fs.readFileSync(path.join(snapDir, f), "utf-8"));
                            refs.push({
                                id: snap.snapshotId ?? f.replace(".json", ""),
                                compiledAt: snap.metadata?.compiledAt ?? "",
                                fileCount: snap.files?.length ?? 0,
                                symbolCount: snap.symbols?.length ?? 0,
                            });
                        }
                        catch { /* skip */ }
                    }
                }
                spinner.stop();
                if (opts.json) {
                    printJson({ ok: true, snapshots: refs });
                }
                else {
                    if (refs.length === 0) {
                        logger.log(gray("No snapshots found."));
                    }
                    else {
                        logger.log(renderTable([
                            { header: "ID", key: "id", width: 20 },
                            { header: "Files", key: "fileCount", width: 8, align: "right" },
                            { header: "Symbols", key: "symbolCount", width: 10, align: "right" },
                            { header: "Compiled At", key: "compiledAt", width: 26 },
                        ], refs.map(r => ({
                            id: r.id,
                            fileCount: String(r.fileCount),
                            symbolCount: String(r.symbolCount),
                            compiledAt: r.compiledAt,
                        }))));
                    }
                }
                break;
            }
            case "validate": {
                const snap = await svc.latestSnapshot();
                if (!snap)
                    throw new ValidationError("No snapshot to validate");
                const report = await svc.validate(snap.snapshotId);
                spinner.stop();
                if (opts.json) {
                    printJson({ ok: report.valid, report });
                }
                else {
                    logger.log(report.valid
                        ? `\x1b[32m✔\x1b[0m Snapshot ${snap.snapshotId} is valid`
                        : `\x1b[31m✖\x1b[0m Snapshot ${snap.snapshotId} has issues`);
                    logger.log(JSON.stringify(report, null, 2));
                }
                break;
            }
            case "compact": {
                // Compact: remove old snapshots except 5 most recent
                const snapDir = paths.snapshotsDir;
                let removed = 0;
                if (fs.existsSync(snapDir)) {
                    const files = fs.readdirSync(snapDir)
                        .filter(f => f.endsWith(".json") && f !== "index.json")
                        .map(f => ({ name: f, mtime: fs.statSync(path.join(snapDir, f)).mtimeMs }))
                        .sort((a, b) => b.mtime - a.mtime);
                    for (const f of files.slice(5)) {
                        fs.unlinkSync(path.join(snapDir, f.name));
                        removed++;
                    }
                }
                spinner.stop();
                if (opts.json)
                    printJson({ ok: true, status: "compacted", removed });
                else
                    logger.log(`Context storage compacted. Removed ${removed} old snapshot(s).`);
                break;
            }
            case "rollback": {
                const targetId = cmdOpts["to"];
                if (!targetId)
                    throw new ValidationError("--to <snapshot-id> is required");
                const snap = await svc.rollback(targetId);
                spinner.stop();
                if (opts.json) {
                    printJson({ ok: true, snapshotId: snap.snapshotId });
                }
                else {
                    logger.log(`Rolled back to snapshot: ${snap.snapshotId}`);
                }
                break;
            }
            case "delta": {
                const fromId = cmdOpts["from"];
                const toId = cmdOpts["to"];
                if (!fromId || !toId)
                    throw new ValidationError("--from and --to are required");
                // Load both snapshots and compute basic delta
                const snapDir = paths.snapshotsDir;
                const loadSnap = (id) => {
                    const candidates = fs.existsSync(snapDir)
                        ? fs.readdirSync(snapDir).filter(f => f.includes(id))
                        : [];
                    if (candidates.length === 0)
                        throw new ValidationError(`Snapshot not found: ${id}`);
                    return JSON.parse(fs.readFileSync(path.join(snapDir, candidates[0]), "utf-8"));
                };
                const from = loadSnap(fromId);
                const to = loadSnap(toId);
                const delta = {
                    fromId, toId,
                    filesDelta: (to.files?.length ?? 0) - (from.files?.length ?? 0),
                    symbolsDelta: (to.symbols?.length ?? 0) - (from.symbols?.length ?? 0),
                };
                spinner.stop();
                if (opts.json) {
                    printJson({ ok: true, delta });
                }
                else {
                    logger.log(bold("Context Delta"));
                    logger.log(JSON.stringify(delta, null, 2));
                }
                break;
            }
            default: throw new ValidationError(`Unknown context subcommand: ${sub}`);
        }
    }
    catch (err) {
        spinner.stop();
        throw err;
    }
    finally {
        svc.destroy();
    }
}
