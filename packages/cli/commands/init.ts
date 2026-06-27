// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — init command
// brain init  →  Initialize .brain workspace
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { GlobalOptions } from "../main.js";
import { logger } from "../utils/logger.js";
import { printJson } from "../utils/json.js";
import { brainDir, configPath, isBrainInitialized, saveConfig } from "../utils/paths.js";
import { success, warn } from "../utils/colors.js";

const SUBDIRS = [
    "snapshots",
    "patches",
    "cache",
    "retrieval-cache",
    "journal",
    "checkpoints",
    "learning",
    "shared-memory",
    "locks",
];

export async function runInit(opts: GlobalOptions): Promise<void> {
    const workspace = opts.workspace;

    if (isBrainInitialized(workspace)) {
        if (opts.json) {
            printJson({ ok: true, status: "already-initialized", workspace });
        } else {
            logger.log(warn("Workspace already initialized: " + workspace));
        }
        return;
    }

    const dir = brainDir(workspace);
    fs.mkdirSync(dir, { recursive: true });
    for (const sub of SUBDIRS) {
        fs.mkdirSync(path.join(dir, sub), { recursive: true });
    }

    const config = {
        version: "1",
        projectRoot: opts.project,
        workspaceRoot: workspace,
        createdAt: new Date().toISOString(),
    };
    saveConfig(workspace, config);

    if (opts.json) {
        printJson({ ok: true, status: "initialized", workspace, config });
    } else {
        logger.log(success("Workspace initialized"));
        logger.log(`  Directory: ${dir}`);
        logger.log(`  Project:   ${opts.project}`);
    }
}
