// ──────────────────────────────────────────────────────────────────────────────
// BUILD-070 — CLI — inspect command
// brain inspect  →  Display diagnostic snapshot status and integrity
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { GlobalOptions } from "../main.js";
import { logger } from "../utils/logger.js";
import { printJson } from "../utils/json.js";
import { requireBrainInitialized } from "../utils/paths.js";
import { SnapshotStorage } from "../../context-compiler/storage.js";
import { ContextRetrievalService } from "../../context-retrieval/service.js";
import { StoragePaths } from "../../kernel/paths.js";

export async function runInspect(opts: GlobalOptions): Promise<void> {
    requireBrainInitialized(opts.workspace);

    const storage = new SnapshotStorage(opts.workspace);
    const latest = await storage.latest();

    if (!latest) {
        if (opts.json) {
            printJson({
                ok: false,
                status: "empty",
                message: "No snapshots or indexed data available."
            });
        } else {
            logger.log("No snapshots or indexed data available. Please run: brain compile");
        }
        return;
    }

    const brainPaths = new StoragePaths(opts.workspace);
    const snapshotFile = path.join(brainPaths.snapshotsDir, `${latest.snapshotId}.json`);
    const architectureExists = latest.architecture && latest.architecture.length > 0 ? "Yes" : "No";
    const architectureCount = latest.architecture ? latest.architecture.length : 0;
    const fileCount = latest.files ? latest.files.length : 0;
    const symbolCount = latest.symbols ? latest.symbols.length : 0;
    const dependencyCount = latest.dependencies ? latest.dependencies.length : 0;
    const relationshipCount = latest.relationships ? latest.relationships.length : 0;
    const memoryCount = (latest.semanticMemory ? latest.semanticMemory.length : 0) +
                        (latest.learning ? latest.learning.length : 0) +
                        (latest.architecture ? latest.architecture.length : 0);

    // Verify retrieval works
    let retrievalStatus = "Unknown";
    try {
        const retrievalService = new ContextRetrievalService(opts.project, opts.workspace);
        const res = await retrievalService.retrieve({
            query: "test retrieval query",
            useCache: false
        });
        retrievalStatus = res && res.retrievalPackage ? "Success" : "Failed";
    } catch (err: any) {
        retrievalStatus = `Failed: ${err.message}`;
    }

    if (opts.json) {
        printJson({
            ok: true,
            snapshotId: latest.snapshotId,
            workspace: opts.workspace,
            snapshotPath: snapshotFile,
            architectureExists: architectureExists === "Yes",
            architectureCount,
            fileCount,
            symbolCount,
            dependencyCount,
            relationshipCount,
            memoryCount,
            retrievalStatus
        });
    } else {
        logger.log(`Workspace:           ${opts.workspace}`);
        logger.log(`Latest Snapshot ID:  ${latest.snapshotId}`);
        logger.log(`Snapshot Path:       ${snapshotFile}`);
        logger.log(`Architecture Exists: ${architectureExists} (${architectureCount} entries)`);
        logger.log(`File Count:          ${fileCount}`);
        logger.log(`Symbol Count:        ${symbolCount}`);
        logger.log(`Dependency Count:    ${dependencyCount}`);
        logger.log(`Relationship Count:  ${relationshipCount}`);
        logger.log(`Memory Entry Count:  ${memoryCount}`);
        logger.log(`Retrieval Status:    ${retrievalStatus}`);
    }
}
