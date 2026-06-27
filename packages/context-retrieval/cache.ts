import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { RetrievalPackage, RetrievalCacheEntry } from "./types";

export class RetrievalCache {
    private readonly cacheDir: string;
    private readonly memoryCache = new Map<string, RetrievalCacheEntry>();
    private readonly maxItems = 50;

    constructor(workspaceRoot: string) {
        this.cacheDir = path.join(workspaceRoot, ".brain", "context", "retrieval-cache");
    }

    async ensureDirectory(): Promise<void> {
        await fs.mkdir(this.cacheDir, { recursive: true });
    }

    computeKey(snapshotId: string, query: string): string {
        const queryHash = crypto.createHash("sha256").update(query).digest("hex");
        return `${snapshotId}_${queryHash}`;
    }

    async has(snapshotId: string, query: string): Promise<boolean> {
        const key = this.computeKey(snapshotId, query);
        if (this.memoryCache.has(key)) return true;

        const p = this.getCachePath(key);
        try {
            await fs.access(p);
            return true;
        } catch {
            return false;
        }
    }

    async get(snapshotId: string, query: string): Promise<RetrievalPackage | null> {
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
            const entry = JSON.parse(raw) as RetrievalCacheEntry;
            this.memoryCache.set(key, entry);
            return entry.retrievalPackage;
        } catch {
            return null;
        }
    }

    async put(snapshotId: string, query: string, pkg: RetrievalPackage): Promise<void> {
        await this.ensureDirectory();
        const key = this.computeKey(snapshotId, query);
        const entry: RetrievalCacheEntry = {
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
                } catch { /* ignore */ }
            }
        }

        const p = this.getCachePath(key);
        try {
            await fs.writeFile(p, JSON.stringify(entry, null, 2), "utf8");
        } catch { /* ignore */ }
    }

    async clear(): Promise<void> {
        this.memoryCache.clear();
        try {
            const files = await fs.readdir(this.cacheDir);
            for (const file of files) {
                if (file.endsWith(".json")) {
                    await fs.unlink(path.join(this.cacheDir, file));
                }
            }
        } catch { /* ignore */ }
    }

    private getCachePath(key: string): string {
        return path.join(this.cacheDir, `${key}.json`);
    }
}
