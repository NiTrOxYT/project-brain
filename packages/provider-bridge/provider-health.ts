// ──────────────────────────────────────────────────────────────────────────────
// BUILD-069 — Provider Health Database
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";

export interface ProviderHealth {
    lastSuccessfulVerification:  string | null;
    lastSuccessfulMcpHandshake:  string | null;
    lastSuccessfulToolInvocation: string | null;
    consecutiveFailures:          number;
    lastConfigurationMigration:   string | null;
    lastRepairExecution:          string | null;
}

export class ProviderHealthRegistry {
    private static getHealthPath(workspaceRoot?: string): string {
        const root = workspaceRoot ?? process.cwd();
        return path.join(root, ".brain", "provider-health.json");
    }

    static loadAll(workspaceRoot?: string): Record<string, ProviderHealth> {
        const filePath = this.getHealthPath(workspaceRoot);
        if (!fs.existsSync(filePath)) return {};
        try {
            return JSON.parse(fs.readFileSync(filePath, "utf-8"));
        } catch {
            return {};
        }
    }

    static get(providerId: string, workspaceRoot?: string): ProviderHealth {
        const all = this.loadAll(workspaceRoot);
        if (all[providerId]) return all[providerId];
        return {
            lastSuccessfulVerification: null,
            lastSuccessfulMcpHandshake: null,
            lastSuccessfulToolInvocation: null,
            consecutiveFailures: 0,
            lastConfigurationMigration: null,
            lastRepairExecution: null
        };
    }

    static save(providerId: string, health: ProviderHealth, workspaceRoot?: string): void {
        const filePath = this.getHealthPath(workspaceRoot);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const all = this.loadAll(workspaceRoot);
        all[providerId] = health;
        fs.writeFileSync(filePath, JSON.stringify(all, null, 2), "utf-8");
    }

    static recordSuccess(providerId: string, metric: keyof Omit<ProviderHealth, "consecutiveFailures">, workspaceRoot?: string): void {
        const health = this.get(providerId, workspaceRoot);
        health[metric] = new Date().toISOString();
        health.consecutiveFailures = 0;
        this.save(providerId, health, workspaceRoot);
    }

    static recordFailure(providerId: string, workspaceRoot?: string): void {
        const health = this.get(providerId, workspaceRoot);
        health.consecutiveFailures += 1;
        this.save(providerId, health, workspaceRoot);
    }
}
