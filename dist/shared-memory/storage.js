import fs from "fs/promises";
import path from "path";
import { MemoryPersistenceError } from "./errors";
export class SharedMemoryStorage {
    rootDir;
    snapshotDir;
    artifactDir;
    constructor(workspaceRoot) {
        this.rootDir = path.join(workspaceRoot, ".brain", "shared-memory");
        this.snapshotDir = path.join(this.rootDir, "snapshots");
        this.artifactDir = path.join(this.rootDir, "artifacts");
    }
    async ensureDirectories() {
        await fs.mkdir(this.rootDir, { recursive: true });
        await fs.mkdir(this.snapshotDir, { recursive: true });
        await fs.mkdir(this.artifactDir, { recursive: true });
    }
    async saveSnapshot(state, snapshotId) {
        await this.ensureDirectories();
        const snapState = {
            agents: Object.fromEntries(state.agents.entries()),
            sessions: Object.fromEntries(state.sessions.entries()),
            assignments: Object.fromEntries(state.assignments.entries()),
            observations: state.observations,
            findings: state.findings,
            artifacts: state.artifacts,
            facts: state.facts,
            constraints: state.constraints,
            decisions: state.decisions,
            issues: state.issues,
            warnings: state.warnings,
            proposals: state.proposals,
            conflicts: state.conflicts,
            resolutions: Object.fromEntries(state.resolutions.entries()),
            tasks: Object.fromEntries(state.tasks.entries()),
            phase: state.phase
        };
        const snap = {
            snapshotId,
            state: snapState,
            savedAt: new Date().toISOString()
        };
        const p = path.join(this.snapshotDir, `${snapshotId}.json`);
        try {
            await fs.writeFile(p, JSON.stringify(snap, null, 2), "utf8");
            // Also write latest pointer
            await fs.writeFile(path.join(this.rootDir, "latest.json"), JSON.stringify(snap, null, 2), "utf8");
        }
        catch (err) {
            throw new MemoryPersistenceError(`Failed to save snapshot: ${err.message}`);
        }
        return snap;
    }
    async loadSnapshot(snapshotId) {
        const p = path.join(this.snapshotDir, `${snapshotId}.json`);
        try {
            const raw = await fs.readFile(p, "utf8");
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    async loadLatest() {
        const p = path.join(this.rootDir, "latest.json");
        try {
            const raw = await fs.readFile(p, "utf8");
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    async clear() {
        try {
            await fs.rm(this.rootDir, { recursive: true, force: true });
        }
        catch { /* best-effort */ }
    }
}
