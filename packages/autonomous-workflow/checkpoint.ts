import fs from "fs";
import path from "path";
import { WorkflowCheckpoint } from "./types.js";
import { CheckpointError } from "./errors.js";
import { WorkspaceEngine } from "../workspace/workspace-engine.js";

export class WorkflowCheckpointService {
    private readonly checkpointDir: string;
    private readonly checkpointPath: string;

    constructor(
        private readonly workspaceRoot: string,
        private readonly workflowId: string,
        private readonly workspaceEngine: WorkspaceEngine
    ) {
        this.checkpointDir = path.join(workspaceRoot, ".brain", "workflows", this.workflowId);
        this.checkpointPath = path.join(this.checkpointDir, "checkpoint.json");
    }

    getFilePath(): string {
        return this.checkpointPath;
    }

    async save(checkpoint: WorkflowCheckpoint): Promise<void> {
        try {
            if (!fs.existsSync(this.checkpointDir)) {
                const txDir = this.workspaceEngine.beginTransaction();
                this.workspaceEngine.stage(txDir.id, {
                    kind: "CreateDirectory",
                    path: this.checkpointDir,
                    recursive: true
                });
                await this.workspaceEngine.commit(txDir.id);
            }

            const content = JSON.stringify(checkpoint, null, 2);
            const tx = this.workspaceEngine.beginTransaction();
            this.workspaceEngine.stage(tx.id, {
                kind: "WriteFile",
                path: this.checkpointPath,
                content
            });
            await this.workspaceEngine.commit(tx.id);
        } catch (err: any) {
            throw new CheckpointError(`Failed to save checkpoint: ${err.message}`);
        }
    }

    load(): WorkflowCheckpoint | null {
        try {
            if (!fs.existsSync(this.checkpointPath)) {
                return null;
            }
            const data = fs.readFileSync(this.checkpointPath, "utf8");
            return JSON.parse(data) as WorkflowCheckpoint;
        } catch (err: any) {
            throw new CheckpointError(`Failed to load checkpoint: ${err.message}`);
        }
    }

    resume(): WorkflowCheckpoint | null {
        return this.load();
    }

    async rollback(checkpoint: WorkflowCheckpoint): Promise<void> {
        // Rollback updates the checkpoint on disk with the provided state
        await this.save(checkpoint);
    }

    recover(checkpoint: WorkflowCheckpoint): WorkflowCheckpoint {
        return {
            ...checkpoint,
            state: "Recovered",
            timestamp: new Date().toISOString()
        };
    }

    async clear(): Promise<void> {
        try {
            if (fs.existsSync(this.checkpointPath)) {
                const tx = this.workspaceEngine.beginTransaction();
                this.workspaceEngine.stage(tx.id, {
                    kind: "DeleteFile",
                    path: this.checkpointPath
                });
                await this.workspaceEngine.commit(tx.id);
            }
        } catch {}
    }
}
