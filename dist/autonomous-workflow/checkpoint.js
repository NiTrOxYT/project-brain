import fs from "fs";
import path from "path";
import { CheckpointError } from "./errors";
export class WorkflowCheckpointService {
    workspaceRoot;
    workflowId;
    workspaceEngine;
    checkpointDir;
    checkpointPath;
    constructor(workspaceRoot, workflowId, workspaceEngine) {
        this.workspaceRoot = workspaceRoot;
        this.workflowId = workflowId;
        this.workspaceEngine = workspaceEngine;
        this.checkpointDir = path.join(workspaceRoot, ".brain", "workflows", this.workflowId);
        this.checkpointPath = path.join(this.checkpointDir, "checkpoint.json");
    }
    getFilePath() {
        return this.checkpointPath;
    }
    async save(checkpoint) {
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
    resume() {
        return this.load();
    }
    async rollback(checkpoint) {
        // Rollback updates the checkpoint on disk with the provided state
        await this.save(checkpoint);
    }
    recover(checkpoint) {
        return {
            ...checkpoint,
            state: "Recovered",
            timestamp: new Date().toISOString()
        };
    }
    async clear() {
        try {
            if (fs.existsSync(this.checkpointPath)) {
                const tx = this.workspaceEngine.beginTransaction();
                this.workspaceEngine.stage(tx.id, {
                    kind: "DeleteFile",
                    path: this.checkpointPath
                });
                await this.workspaceEngine.commit(tx.id);
            }
        }
        catch { }
    }
}
