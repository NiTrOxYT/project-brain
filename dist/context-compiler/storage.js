// ──────────────────────────────────────────────────────────────────────────────
// BUILD-054 — Context Compiler — Storage
// Handles save/load/list/delete/latest/compact under .brain/context/snapshots/
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs/promises";
import path from "path";
import { SnapshotStorageError } from "./errors.js";
import { StoragePaths } from "../kernel/paths.js";
export class SnapshotStorage {
    snapshotsDir;
    indexPath;
    constructor(workspaceRoot) {
        const paths = new StoragePaths(workspaceRoot);
        this.snapshotsDir = paths.snapshotsDir;
        this.indexPath = paths.indexPath;
    }
    async ensureDirectory() {
        await fs.mkdir(this.snapshotsDir, { recursive: true });
    }
    async save(snapshot) {
        await this.ensureDirectory();
        const snapshotPath = this.getSnapshotPath(snapshot.snapshotId);
        try {
            await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), "utf8");
        }
        catch (err) {
            throw new SnapshotStorageError(`Failed to save snapshot: ${err.message}`);
        }
        // Update index
        const index = await this.loadIndex();
        const ref = {
            snapshotId: snapshot.snapshotId,
            createdAt: snapshot.metadata.createdAt,
            fingerprint: snapshot.metadata.fingerprint,
            estimatedTokens: snapshot.metadata.estimatedTokens,
            incremental: snapshot.metadata.incremental,
            parentSnapshotId: snapshot.metadata.parentSnapshotId
        };
        // Remove any existing entry with same id then prepend
        const filtered = index.filter(r => r.snapshotId !== snapshot.snapshotId);
        filtered.unshift(ref);
        await this.saveIndex(filtered);
    }
    async load(snapshotId) {
        const snapshotPath = this.getSnapshotPath(snapshotId);
        try {
            const raw = await fs.readFile(snapshotPath, "utf8");
            return JSON.parse(raw);
        }
        catch (err) {
            if (err.code === "ENOENT")
                return null;
            throw new SnapshotStorageError(`Failed to load snapshot '${snapshotId}': ${err.message}`);
        }
    }
    async latest() {
        const index = await this.loadIndex();
        if (index.length === 0)
            return null;
        const latestRef = index[0]; // Index is stored newest-first
        return this.load(latestRef.snapshotId);
    }
    async latestReference() {
        const index = await this.loadIndex();
        return index.length > 0 ? index[0] : null;
    }
    async list() {
        return this.loadIndex();
    }
    async delete(snapshotId) {
        const snapshotPath = this.getSnapshotPath(snapshotId);
        try {
            await fs.unlink(snapshotPath);
        }
        catch (err) {
            if (err.code !== "ENOENT") {
                throw new SnapshotStorageError(`Failed to delete snapshot '${snapshotId}': ${err.message}`);
            }
        }
        // Remove from index
        const index = await this.loadIndex();
        const filtered = index.filter(r => r.snapshotId !== snapshotId);
        await this.saveIndex(filtered);
    }
    /**
     * Compact: keep only the N most recent snapshots, delete the rest.
     */
    async compact(keepCount = 10) {
        const index = await this.loadIndex();
        if (index.length <= keepCount)
            return 0;
        const toDelete = index.slice(keepCount);
        let deleted = 0;
        for (const ref of toDelete) {
            try {
                await this.delete(ref.snapshotId);
                deleted++;
            }
            catch {
                // Best-effort
            }
        }
        return deleted;
    }
    // ─── Helpers ─────────────────────────────────────────────────────────────
    getSnapshotPath(snapshotId) {
        return path.join(this.snapshotsDir, `${snapshotId}.json`);
    }
    async loadIndex() {
        try {
            const raw = await fs.readFile(this.indexPath, "utf8");
            return JSON.parse(raw);
        }
        catch {
            return [];
        }
    }
    async saveIndex(index) {
        try {
            await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2), "utf8");
        }
        catch (err) {
            throw new SnapshotStorageError(`Failed to save snapshot index: ${err.message}`);
        }
    }
}
