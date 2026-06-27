// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — stats command
// brain stats  →  Aggregated metrics across all subsystems
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { GlobalOptions } from "../main.js";
import { logger } from "../utils/logger.js";
import { printJson } from "../utils/json.js";
import { brainDir } from "../utils/paths.js";
import { renderKeyValue } from "../utils/table.js";
import { bold, gray } from "../utils/colors.js";
import { StoragePaths } from "../../kernel/paths.js";

function readJsonFile(p: string): any {
    try {
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
    } catch { /* ignore */ }
    return null;
}

function dirFileCount(d: string): number {
    if (!fs.existsSync(d)) return 0;
    return fs.readdirSync(d).length;
}

export async function runStats(opts: GlobalOptions): Promise<void> {
    const paths = new StoragePaths(opts.workspace);

    const snapshots = fs.existsSync(paths.snapshotsDir)
        ? fs.readdirSync(paths.snapshotsDir).filter(f => f.endsWith(".json") && f !== "index.json").length
        : 0;
    const cacheFiles = dirFileCount(paths.compilerCacheDir);
    const journalFiles = dirFileCount(paths.journalDir);
    const checkpoints = dirFileCount(paths.checkpointsDir);
    const learningFiles = dirFileCount(paths.learningDir);

    // Load latest snapshot for context stats
    const snapDir = paths.snapshotsDir;
    let latestSnap: any = null;
    if (fs.existsSync(snapDir)) {
        const snaps = fs.readdirSync(snapDir)
            .filter(f => f.endsWith(".json") && f !== "index.json")
            .map(f => ({ name: f, mtime: fs.statSync(path.join(snapDir, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime);
        if (snaps.length > 0) {
            latestSnap = readJsonFile(path.join(snapDir, snaps[0].name));
        }
    }

    const stats = {
        compilation: {
            snapshots,
            files:   latestSnap?.files?.length   ?? 0,
            symbols: latestSnap?.symbols?.length  ?? 0,
            lastCompiled: latestSnap?.metadata?.compiledAt ?? "never",
        },
        sync: {
            cacheFiles,
        },
        retrieval: {
            cacheHits: "—",
        },
        learning: {
            learningFiles,
        },
        workflow: {
            journalFiles,
            checkpoints,
        },
        workspace: {
            brainDir: paths.brainDir,
        },
    };

    if (opts.json) {
        printJson({ ok: true, stats });
    } else {
        logger.log(`\n${bold("brain stats")}\n`);

        logger.log(bold("  Compilation"));
        logger.log(renderKeyValue([
            ["Snapshots",      String(stats.compilation.snapshots)],
            ["Files",          String(stats.compilation.files)],
            ["Symbols",        String(stats.compilation.symbols)],
            ["Last Compiled",  stats.compilation.lastCompiled],
        ], 18));

        logger.blank();
        logger.log(bold("  Sync"));
        logger.log(renderKeyValue([["Cache Files", String(stats.sync.cacheFiles)]], 18));

        logger.blank();
        logger.log(bold("  Learning"));
        logger.log(renderKeyValue([["Learning Files", String(stats.learning.learningFiles)]], 18));

        logger.blank();
        logger.log(bold("  Workflow"));
        logger.log(renderKeyValue([
            ["Journals",    String(stats.workflow.journalFiles)],
            ["Checkpoints", String(stats.workflow.checkpoints)],
        ], 18));

        logger.blank();
        logger.log(bold("  Workspace"));
        logger.log(renderKeyValue([["Brain Dir", stats.workspace.brainDir]], 18));
    }
}
