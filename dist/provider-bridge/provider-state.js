// ──────────────────────────────────────────────────────────────────────────────
// BUILD-069 — Provider Verification State Model
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
export class ProviderStateRegistry {
    static getStatePath(workspaceRoot) {
        const root = workspaceRoot ?? process.cwd();
        return path.join(root, ".brain", "provider-verification.json");
    }
    static loadAll(workspaceRoot) {
        const filePath = this.getStatePath(workspaceRoot);
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
        return all[providerId] || null;
    }
    static save(state, workspaceRoot) {
        const filePath = this.getStatePath(workspaceRoot);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const all = this.loadAll(workspaceRoot);
        all[state.providerId] = state;
        fs.writeFileSync(filePath, JSON.stringify(all, null, 2), "utf-8");
    }
    static invalidate(providerId, workspaceRoot) {
        const state = this.get(providerId, workspaceRoot);
        if (state) {
            state.installationVerified = false;
            state.configurationVerified = false;
            state.connectivityVerified = false;
            state.toolVerificationPassed = false;
            state.behaviorVerificationPassed = false;
            state.verificationTimestamp = new Date().toISOString();
            this.save(state, workspaceRoot);
        }
    }
}
