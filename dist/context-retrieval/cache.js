import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
export class RetrievalCache {
    cacheDir;
    memoryCache = new Map();
    maxItems = 50;
    constructor(workspaceRoot) {
        this.cacheDir = path.join(workspaceRoot, ".brain", "context", "retrieval-cache");
    }
    async ensureDirectory() {
        await fs.mkdir(this.cacheDir, { recursive: true });
    }
    computeKey(snapshotId, query) {
        const queryHash = crypto.createHash("sha256").update(query).digest("hex");
        return `${snapshotId}_${queryHash}`;
    }
    async has(snapshotId, query) {
        const key = this.computeKey(snapshotId, query);
        if (this.memoryCache.has(key))
            return true;
        const p = this.getCachePath(key);
        try {
            await fs.access(p);
            return true;
        }
        catch {
            return false;
        }
    }
    async get(snapshotId, query) {
        const key = this.computeKey(snapshotId, query);
        // Memory hit
        const mem = this.memoryCache.get(key);
        if (mem) {
            // Update LRU position by re-inserting
            this.memoryCache.delete(key);
            this.memoryCache.set(key, mem);
            return mem.retrievalPackage;
        }
        // Disk hit
        const p = this.getCachePath(key);
        try {
            const raw = await fs.readFile(p, "utf8");
            const entry = JSON.parse(raw);
            this.memoryCache.set(key, entry);
            return entry.retrievalPackage;
        }
        catch {
            return null;
        }
    }
    async put(snapshotId, query, pkg) {
        await this.ensureDirectory();
        const key = this.computeKey(snapshotId, query);
        const entry = {
            queryFingerprint: key,
            snapshotId,
            retrievalPackage: pkg,
            storedAt: new Date().toISOString()
        };
        this.memoryCache.set(key, entry);
        // Evict if cache exceeds cap
        if (this.memoryCache.size > this.maxItems) {
            const firstKey = this.memoryCache.keys().next().value;
            if (firstKey) {
                this.memoryCache.delete(firstKey);
                // best effort evict on disk
                try {
                    await fs.unlink(this.getCachePath(firstKey));
                }
                catch { /* ignore */ }
            }
        }
        const p = this.getCachePath(key);
        try {
            await fs.writeFile(p, JSON.stringify(entry, null, 2), "utf8");
        }
        catch { /* ignore */ }
    }
    async clear() {
        this.memoryCache.clear();
        try {
            const files = await fs.readdir(this.cacheDir);
            for (const file of files) {
                if (file.endsWith(".json")) {
                    await fs.unlink(path.join(this.cacheDir, file));
                }
            }
        }
        catch { /* ignore */ }
    }
    getCachePath(key) {
        return path.join(this.cacheDir, `${key}.json`);
    }
}
