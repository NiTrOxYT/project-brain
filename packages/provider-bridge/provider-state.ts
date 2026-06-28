// ──────────────────────────────────────────────────────────────────────────────
// BUILD-069 — Provider Verification State Model
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";

export interface ProviderVerificationState {
    providerId:                 string;
    installationVerified:       boolean;
    configurationVerified:      boolean;
    connectivityVerified:       boolean;
    toolVerificationPassed:     boolean;
    behaviorVerificationPassed: boolean;
    verificationTimestamp:      string;
}

export class ProviderStateRegistry {
    private static getStatePath(workspaceRoot?: string): string {
        const root = workspaceRoot ?? process.cwd();
        return path.join(root, ".brain", "provider-verification.json");
    }

    static loadAll(workspaceRoot?: string): Record<string, ProviderVerificationState> {
        const filePath = this.getStatePath(workspaceRoot);
        if (!fs.existsSync(filePath)) return {};
        try {
            return JSON.parse(fs.readFileSync(filePath, "utf-8"));
        } catch {
            return {};
        }
    }

    static get(providerId: string, workspaceRoot?: string): ProviderVerificationState | null {
        const all = this.loadAll(workspaceRoot);
        return all[providerId] || null;
    }

    static save(state: ProviderVerificationState, workspaceRoot?: string): void {
        const filePath = this.getStatePath(workspaceRoot);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const all = this.loadAll(workspaceRoot);
        all[state.providerId] = state;
        fs.writeFileSync(filePath, JSON.stringify(all, null, 2), "utf-8");
    }

    static invalidate(providerId: string, workspaceRoot?: string): void {
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
