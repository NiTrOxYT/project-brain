// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — clean command
// brain clean  →  Remove cache/temp/old snapshots
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import { logger } from "../utils/logger.js";
import { printJson } from "../utils/json.js";
import { bold, gray } from "../utils/colors.js";
import { StoragePaths } from "../../kernel/paths.js";
export async function runClean(opts, cmdOpts) {
    const paths = new StoragePaths(opts.workspace);
    const dry = cmdOpts.dryRun ?? false;
    const targets = [
        { label: "cache", path: paths.compilerCacheDir, kind: "dir-contents" },
        { label: "retrieval-cache", path: paths.retrievalCacheDir, kind: "dir-contents" },
        { label: "journal archives", path: paths.journalDir, kind: "dir-contents" },
        { label: "checkpoints", path: paths.checkpointsDir, kind: "dir-contents" },
    ];
    // old snapshots: keep 5 most recent
    const snapDir = paths.snapshotsDir;
    const oldSnapshots = [];
    if (fs.existsSync(snapDir)) {
        const snaps = fs.readdirSync(snapDir)
            .filter(f => f.endsWith(".json") && f !== "index.json")
            .map(f => ({ name: f, mtime: fs.statSync(path.join(snapDir, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime);
        for (const s of snaps.slice(5)) {
            oldSnapshots.push({ label: `old snapshot: ${s.name}`, path: path.join(snapDir, s.name), kind: "file" });
        }
    }
    const allTargets = [...targets, ...oldSnapshots];
    const removed = [];
    let totalBytes = 0;
    for (const t of allTargets) {
        if (!fs.existsSync(t.path))
            continue;
        if (t.kind === "dir-contents") {
            const files = fs.readdirSync(t.path);
            for (const f of files) {
                const fp = path.join(t.path, f);
                try {
                    const stat = fs.statSync(fp);
                    totalBytes += stat.size;
                    if (!dry)
                        fs.rmSync(fp, { recursive: true });
                    removed.push(fp);
                }
                catch { /* best-effort */ }
            }
        }
        else {
            try {
                const stat = fs.statSync(t.path);
                totalBytes += stat.size;
                if (!dry)
                    fs.unlinkSync(t.path);
                removed.push(t.path);
            }
            catch { /* best-effort */ }
        }
    }
    const mb = (totalBytes / 1e6).toFixed(2);
    if (opts.json) {
        printJson({ ok: true, dryRun: dry, removed, bytesFreed: totalBytes });
    }
    else {
        if (dry)
            logger.log(bold("Dry run — no files deleted"));
        logger.log(`  Removed: ${removed.length} item(s)  (${mb} MB freed)`);
        if (opts.verbose) {
            for (const r of removed)
                logger.log(`  ${gray(r)}`);
        }
    }
}
