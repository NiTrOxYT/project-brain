// ──────────────────────────────────────────────────────────────────────────────
// BUILD-069 — Provider Lock Registry & Drift Detection
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface ProviderLock {
    providerId:            string;
    executablePath:        string;
    detectedVersion:       string;
    selectedTransport:     "stdio" | "http" | "none";
    configurationFile:     string;
    schemaVersion:         string;
    configurationChecksum: string;
    selectedIntegrationMode: string;
}

export class ProviderLockRegistry {
    private static getLockPath(workspaceRoot?: string): string {
        const root = workspaceRoot ?? process.cwd();
        return path.join(root, ".brain", "providers.lock.json");
    }

    static calculateChecksum(filePath: string): string {
        if (!fs.existsSync(filePath)) return "";
        try {
            const content = fs.readFileSync(filePath, "utf-8");
            return crypto.createHash("sha1").update(content).digest("hex");
        } catch {
            return "";
        }
    }

    static loadAll(workspaceRoot?: string): Record<string, ProviderLock> {
        const filePath = this.getLockPath(workspaceRoot);
        if (!fs.existsSync(filePath)) return {};
        try {
            return JSON.parse(fs.readFileSync(filePath, "utf-8"));
        } catch {
            return {};
        }
    }

    static get(providerId: string, workspaceRoot?: string): ProviderLock | null {
        const all = this.loadAll(workspaceRoot);
        return all[providerId] || null;
    }

    static save(lock: ProviderLock, workspaceRoot?: string): void {
        const filePath = this.getLockPath(workspaceRoot);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const all = this.loadAll(workspaceRoot);
        all[lock.providerId] = lock;
        fs.writeFileSync(filePath, JSON.stringify(all, null, 2), "utf-8");
    }

    static remove(providerId: string, workspaceRoot?: string): void {
        const all = this.loadAll(workspaceRoot);
        if (all[providerId]) {
            delete all[providerId];
            const filePath = this.getLockPath(workspaceRoot);
            fs.writeFileSync(filePath, JSON.stringify(all, null, 2), "utf-8");
        }
    }

    static checkDrift(
        providerId: string,
        currentExecutable: string,
        currentVersion: string,
        currentConfigPath: string,
        workspaceRoot?: string
    ): { drifted: boolean; reason?: string } {
        const lock = this.get(providerId, workspaceRoot);
        if (!lock) {
            return { drifted: true, reason: "No lock file found." };
        }

        if (lock.executablePath !== currentExecutable) {
            return { drifted: true, reason: `Executable path changed from ${lock.executablePath} to ${currentExecutable}.` };
        }

        if (lock.detectedVersion !== currentVersion) {
            return { drifted: true, reason: `Version changed from ${lock.detectedVersion} to ${currentVersion}.` };
        }

        if (lock.configurationFile !== currentConfigPath) {
            return { drifted: true, reason: `Configuration file location changed from ${lock.configurationFile} to ${currentConfigPath}.` };
        }

        const checksum = this.calculateChecksum(currentConfigPath);
        if (lock.configurationChecksum !== checksum) {
            return { drifted: true, reason: "Configuration content drift detected (checksum changed)." };
        }

        return { drifted: false };
    }
}
