// ──────────────────────────────────────────────────────────────────────────────
// BUILD-069 — Provider Health Database
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
export class ProviderHealthRegistry {
    static getHealthPath(workspaceRoot) {
        const root = workspaceRoot ?? process.cwd();
        return path.join(root, ".brain", "provider-health.json");
    }
    static loadAll(workspaceRoot) {
        const filePath = this.getHealthPath(workspaceRoot);
        if (!fs.existsSync(filePath))
            return {};
        try {
            return JSON.parse(fs.readFileSync(filePath, "utf-8"));
        }
        catch {
            return {};
        }
    }
    static get(providerId, workspaceRoot) {
        const all = this.loadAll(workspaceRoot);
        if (all[providerId])
            return all[providerId];
        return {
            lastSuccessfulVerification: null,
            lastSuccessfulMcpHandshake: null,
            lastSuccessfulToolInvocation: null,
            consecutiveFailures: 0,
            lastConfigurationMigration: null,
            lastRepairExecution: null
        };
    }
    static save(providerId, health, workspaceRoot) {
        const filePath = this.getHealthPath(workspaceRoot);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const all = this.loadAll(workspaceRoot);
        all[providerId] = health;
        fs.writeFileSync(filePath, JSON.stringify(all, null, 2), "utf-8");
    }
    static recordSuccess(providerId, metric, workspaceRoot) {
        const health = this.get(providerId, workspaceRoot);
        health[metric] = new Date().toISOString();
        health.consecutiveFailures = 0;
        this.save(providerId, health, workspaceRoot);
    }
    static recordFailure(providerId, workspaceRoot) {
        const health = this.get(providerId, workspaceRoot);
        health.consecutiveFailures += 1;
        this.save(providerId, health, workspaceRoot);
    }
}
