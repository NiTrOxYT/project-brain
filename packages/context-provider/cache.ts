import type { ContextResponse } from "./types.js";

export class ContextCache {
    private static cache: Map<string, { response: ContextResponse; expiresAt: number }> = new Map();
    private static lastSnapshotId: string | null = null;

    static get(
        snapshotId: string,
        normalizedQuery: string,
        openFiles: string[],
        cursorFile?: string
    ): ContextResponse | undefined {
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

    static set(
        snapshotId: string,
        normalizedQuery: string,
        openFiles: string[],
        response: ContextResponse,
        cursorFile?: string
    ): void {
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

    static clear(): void {
        this.cache.clear();
    }

    private static computeKey(
        snapshotId: string,
        normalizedQuery: string,
        openFiles: string[],
        cursorFile?: string
    ): string {
        const sortedFiles = [...openFiles].sort().join(",");
        return `${snapshotId}:${normalizedQuery}:${sortedFiles}:${cursorFile || ""}`;
    }
}
