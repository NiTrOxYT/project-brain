export class ContextCache {
    static cache = new Map();
    static lastSnapshotId = null;
    static get(snapshotId, normalizedQuery, openFiles, cursorFile) {
        // Invalidate completely if snapshot ID changes
        if (this.lastSnapshotId !== snapshotId) {
            this.clear();
            this.lastSnapshotId = snapshotId;
            return undefined;
        }
        const key = this.computeKey(snapshotId, normalizedQuery, openFiles, cursorFile);
        const entry = this.cache.get(key);
        if (entry && entry.expiresAt > Date.now()) {
            return entry.response;
        }
        return undefined;
    }
    static set(snapshotId, normalizedQuery, openFiles, response, cursorFile) {
        if (this.lastSnapshotId !== snapshotId) {
            this.clear();
            this.lastSnapshotId = snapshotId;
        }
        const key = this.computeKey(snapshotId, normalizedQuery, openFiles, cursorFile);
        this.cache.set(key, {
            response,
            expiresAt: Date.now() + 300000 // Cache for 5 mins
        });
    }
    static clear() {
        this.cache.clear();
    }
    static computeKey(snapshotId, normalizedQuery, openFiles, cursorFile) {
        const sortedFiles = [...openFiles].sort().join(",");
        return `${snapshotId}:${normalizedQuery}:${sortedFiles}:${cursorFile || ""}`;
    }
}
