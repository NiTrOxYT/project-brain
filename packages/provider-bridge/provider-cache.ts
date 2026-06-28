// ──────────────────────────────────────────────────────────────────────────────
// BUILD-069 — Verification Cache
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";

export interface CacheEntry {
    providerVersion:       string;
    brainVersion:          string;
    configurationChecksum: string;
    schemaVersion:         string;
    verificationResult:    any;
}

export class ProviderVerificationCache {
    private static getCachePath(workspaceRoot?: string): string {
        const root = workspaceRoot ?? process.cwd();
        return path.join(root, ".brain", "provider-cache.json");
    }

    static loadAll(workspaceRoot?: string): Record<string, CacheEntry> {
        const filePath = this.getCachePath(workspaceRoot);
        if (!fs.existsSync(filePath)) return {};
        try {
            return JSON.parse(fs.readFileSync(filePath, "utf-8"));
        } catch {
            return {};
        }
    }

    static get(providerId: string, workspaceRoot?: string): CacheEntry | null {
        const all = this.loadAll(workspaceRoot);
        return all[providerId] || null;
    }

    static save(providerId: string, entry: CacheEntry, workspaceRoot?: string): void {
        const filePath = this.getCachePath(workspaceRoot);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const all = this.loadAll(workspaceRoot);
        all[providerId] = entry;
        fs.writeFileSync(filePath, JSON.stringify(all, null, 2), "utf-8");
    }

    static invalidate(providerId: string, workspaceRoot?: string): void {
        const all = this.loadAll(workspaceRoot);
        if (all[providerId]) {
            delete all[providerId];
            const filePath = this.getCachePath(workspaceRoot);
            fs.writeFileSync(filePath, JSON.stringify(all, null, 2), "utf-8");
        }
    }

    static clear(workspaceRoot?: string): void {
        const filePath = this.getCachePath(workspaceRoot);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
}
