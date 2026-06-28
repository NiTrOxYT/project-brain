// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — init command
// brain init  →  Initialize .brain workspace
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import { logger } from "../utils/logger.js";
import { printJson } from "../utils/json.js";
import { isBrainInitialized, saveConfig } from "../utils/paths.js";
import { success, warn } from "../utils/colors.js";
import { StoragePaths } from "../../kernel/paths.js";
export async function runInit(opts) {
    const workspace = opts.workspace;
    if (isBrainInitialized(workspace)) {
        if (opts.json) {
            printJson({ ok: true, status: "already-initialized", workspace });
        }
        else {
            logger.log(warn("Workspace already initialized: " + workspace));
        }
        return;
    }
    const paths = new StoragePaths(workspace);
    const subdirs = [
        paths.snapshotsDir,
        paths.patchesDir,
        paths.compilerCacheDir,
        paths.retrievalCacheDir,
        paths.journalDir,
        paths.checkpointsDir,
        paths.learningDir,
        paths.sharedMemoryDir,
        paths.locksDir,
        paths.workflowsDir,
    ];
    const dir = paths.brainDir;
    fs.mkdirSync(dir, { recursive: true });
    for (const sub of subdirs) {
        fs.mkdirSync(sub, { recursive: true });
    }
    const { WorkspaceService } = await import("../../workspace/service.js");
    const ws = new WorkspaceService({ root: workspace });
    await ws.initialize();
    const config = {
        version: "1",
        projectRoot: opts.project,
        workspaceRoot: workspace,
        createdAt: new Date().toISOString(),
    };
    saveConfig(workspace, config);
    if (opts.json) {
        printJson({ ok: true, status: "initialized", workspace, config });
    }
    else {
        logger.log(success("Workspace initialized"));
        logger.log(`  Directory: ${dir}`);
        logger.log(`  Project:   ${opts.project}`);
    }
}
