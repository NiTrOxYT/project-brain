import fs from "fs/promises";
import path from "path";
import { SnapshotStorage } from "../context-compiler/storage";
import { SnapshotStorageError } from "../context-compiler/errors";
export class SnapshotSyncStorage {
    patchesDir;
    historyDir;
    compilerStorage;
    constructor(workspaceRoot) {
        this.patchesDir = path.join(workspaceRoot, ".brain", "context", "patches");
        this.historyDir = path.join(workspaceRoot, ".brain", "context", "history");
        this.compilerStorage = new SnapshotStorage(workspaceRoot);
    }
    async ensureDirectories() {
        await fs.mkdir(this.patchesDir, { recursive: true });
        await fs.mkdir(this.historyDir, { recursive: true });
        await this.compilerStorage.ensureDirectory();
    }
    async saveSnapshot(snapshot) {
        await this.ensureDirectories();
        await this.compilerStorage.save(snapshot);
    }
    async loadSnapshot(snapshotId) {
        return this.compilerStorage.load(snapshotId);
    }
    async latestSnapshot() {
        return this.compilerStorage.latest();
    }
    async savePatch(patch) {
        await this.ensureDirectories();
        const p = path.join(this.patchesDir, `${patch.patchId}.json`);
        await fs.writeFile(p, JSON.stringify(patch, null, 2), "utf8");
        // Append to history log
        const historyLog = path.join(this.historyDir, "lineage.jsonl");
        const line = JSON.stringify({
            patchId: patch.patchId,
            fromSnapshotId: patch.fromSnapshotId,
            toSnapshotId: patch.toSnapshotId,
            createdAt: patch.createdAt,
            transactionId: patch.transactionId
        }) + "\n";
        await fs.appendFile(historyLog, line, "utf8");
    }
    async loadPatch(patchId) {
        const p = path.join(this.patchesDir, `${patchId}.json`);
        try {
            const raw = await fs.readFile(p, "utf8");
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    async loadLineage() {
        const historyLog = path.join(this.historyDir, "lineage.jsonl");
        try {
            const raw = await fs.readFile(historyLog, "utf8");
            return raw
                .split("\n")
                .filter(line => line.trim().length > 0)
                .map(line => JSON.parse(line));
        }
        catch {
            return [];
        }
    }
    async rollback(targetSnapshotId) {
        const snap = await this.loadSnapshot(targetSnapshotId);
        if (!snap) {
            throw new SnapshotStorageError(`Rollback target snapshot '${targetSnapshotId}' not found.`);
        }
        // Prune lineage log to target
        const lineage = await this.loadLineage();
        const idx = lineage.findIndex(l => l.toSnapshotId === targetSnapshotId);
        const historyLog = path.join(this.historyDir, "lineage.jsonl");
        if (idx !== -1) {
            const kept = lineage.slice(0, idx + 1);
            const content = kept.map(l => JSON.stringify(l)).join("\n") + "\n";
            await fs.writeFile(historyLog, content, "utf8");
        }
        else {
            await fs.writeFile(historyLog, "", "utf8");
        }
        return snap;
    }
}
