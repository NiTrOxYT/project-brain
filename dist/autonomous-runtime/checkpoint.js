// ──────────────────────────────────────────────────────────────────────────────
// BUILD-051 — Autonomous Execution Loop — Checkpointing
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import { CheckpointError } from "./errors";
export class ExecutionCheckpointService {
    checkpointDir;
    checkpointPath;
    constructor(workspaceRoot, planId) {
        this.checkpointDir = path.join(workspaceRoot, ".brain", "runtime", "checkpoints");
        if (!fs.existsSync(this.checkpointDir)) {
            fs.mkdirSync(this.checkpointDir, { recursive: true });
        }
        this.checkpointPath = path.join(this.checkpointDir, `checkpoint-${planId}.json`);
    }
    getFilePath() {
        return this.checkpointPath;
    }
    save(checkpoint) {
        try {
            fs.writeFileSync(this.checkpointPath, JSON.stringify(checkpoint, null, 2), "utf8");
        }
        catch (err) {
            throw new CheckpointError(`Failed to save checkpoint: ${err.message}`);
        }
    }
    load() {
        try {
            if (!fs.existsSync(this.checkpointPath)) {
                return null;
            }
            const data = fs.readFileSync(this.checkpointPath, "utf8");
            return JSON.parse(data);
        }
        catch (err) {
            throw new CheckpointError(`Failed to load checkpoint: ${err.message}`);
        }
    }
    clear() {
        try {
            if (fs.existsSync(this.checkpointPath)) {
                fs.unlinkSync(this.checkpointPath);
            }
        }
        catch { }
    }
}
