// ──────────────────────────────────────────────────────────────────────────────
// BUILD-051 — Autonomous Execution Loop — Checkpointing
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { ExecutionCheckpoint } from "./types";
import { CheckpointError } from "./errors";

export class ExecutionCheckpointService {
    private readonly checkpointDir: string;
    private readonly checkpointPath: string;

    constructor(workspaceRoot: string, planId: string) {
        this.checkpointDir = path.join(workspaceRoot, ".brain", "runtime", "checkpoints");
        if (!fs.existsSync(this.checkpointDir)) {
            fs.mkdirSync(this.checkpointDir, { recursive: true });
        }
        this.checkpointPath = path.join(this.checkpointDir, `checkpoint-${planId}.json`);
    }

    getFilePath(): string {
        return this.checkpointPath;
    }

    save(checkpoint: ExecutionCheckpoint): void {
        try {
            fs.writeFileSync(this.checkpointPath, JSON.stringify(checkpoint, null, 2), "utf8");
        } catch (err: any) {
            throw new CheckpointError(`Failed to save checkpoint: ${err.message}`);
        }
    }

    load(): ExecutionCheckpoint | null {
        try {
            if (!fs.existsSync(this.checkpointPath)) {
                return null;
            }
            const data = fs.readFileSync(this.checkpointPath, "utf8");
            return JSON.parse(data) as ExecutionCheckpoint;
        } catch (err: any) {
            throw new CheckpointError(`Failed to load checkpoint: ${err.message}`);
        }
    }

    clear(): void {
        try {
            if (fs.existsSync(this.checkpointPath)) {
                fs.unlinkSync(this.checkpointPath);
            }
        } catch {}
    }
}
