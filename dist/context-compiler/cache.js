// ──────────────────────────────────────────────────────────────────────────────
// BUILD-054 — Context Compiler — Cache
// Manages in-memory and disk-backed snapshot cache keyed by fingerprint hash.
// Caches the latest snapshot reference for fast fingerprint-based lookups.
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs/promises";
import path from "path";
import { SnapshotCacheError } from "./errors.js";
import { StoragePaths } from "../kernel/paths.js";
export class SnapshotCache {
    cacheDir;
    memoryCache = new Map();
    constructor(workspaceRoot) {
        this.cacheDir = new StoragePaths(workspaceRoot).compilerCacheDir;
    }
    async ensureDirectory() {
        await fs.mkdir(this.cacheDir, { recursive: true });
    }
    /**
     * Check if there is a cached snapshot matching the given fingerprint hash.
     */
    async has(fingerprintHash) {
        // Check in-memory first
        if (this.memoryCache.has(fingerprintHash))
            return true;
        // Check disk
        const p = this.getCachePath(fingerprintHash);
        try {
            await fs.access(p);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Get a cached snapshot by fingerprint hash.
     */
    async get(fingerprintHash) {
        // In-memory hit
        const mem = this.memoryCache.get(fingerprintHash);
        if (mem)
            return mem;
        // Disk hit
        const p = this.getCachePath(fingerprintHash);
        try {
            const raw = await fs.readFile(p, "utf8");
            const snapshot = JSON.parse(raw);
            this.memoryCache.set(fingerprintHash, snapshot);
            return snapshot;
        }
        catch (err) {
            if (err.code === "ENOENT")
                return null;
            throw new SnapshotCacheError(`Failed to read cache entry '${fingerprintHash}': ${err.message}`);
        }
    }
    /**
     * Store a snapshot in cache (in-memory + disk).
     */
    async put(snapshot) {
        await this.ensureDirectory();
        const hash = snapshot.metadata.fingerprint.hash;
        this.memoryCache.set(hash, snapshot);
        const p = this.getCachePath(hash);
        try {
            await fs.writeFile(p, JSON.stringify(snapshot, null, 2), "utf8");
        }
        catch (err) {
            throw new SnapshotCacheError(`Failed to write cache entry '${hash}': ${err.message}`);
        }
    }
    /**
     * Evict a cache entry.
     */
    async evict(fingerprintHash) {
        this.memoryCache.delete(fingerprintHash);
        const p = this.getCachePath(fingerprintHash);
        try {
            await fs.unlink(p);
        }
        catch {
            // Best-effort
        }
    }
    /**
     * List all cache entries (disk-level).
     */
    async listEntries() {
        try {
            await this.ensureDirectory();
            const files = await fs.readdir(this.cacheDir);
            const entries = [];
            for (const file of files) {
                if (!file.endsWith(".json"))
                    continue;
                const fingerprintHash = file.slice(0, -5);
                const fullPath = path.join(this.cacheDir, file);
                try {
                    const stat = await fs.stat(fullPath);
                    // Quick-read only metadata to avoid loading full snapshot
                    const raw = await fs.readFile(fullPath, "utf8");
                    const snap = JSON.parse(raw);
                    entries.push({
                        snapshotId: snap.snapshotId,
                        fingerprint: snap.metadata.fingerprint,
                        storedAt: snap.metadata.compiledAt,
                        sizeBytes: stat.size,
                        filePath: fullPath
                    });
                }
                catch {
                    // skip corrupt entries
                }
            }
            return entries.sort((a, b) => b.storedAt.localeCompare(a.storedAt));
        }
        catch {
            return [];
        }
    }
    /** Clear in-memory cache. */
    clearMemory() {
        this.memoryCache.clear();
    }
    getCachePath(fingerprintHash) {
        return path.join(this.cacheDir, `${fingerprintHash}.json`);
    }
}
