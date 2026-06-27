import fs from "fs";
import path from "path";
export class WorkflowJournalService {
    workspaceRoot;
    workflowId;
    workspaceEngine;
    journalPath;
    events = [];
    constructor(workspaceRoot, workflowId, workspaceEngine) {
        this.workspaceRoot = workspaceRoot;
        this.workflowId = workflowId;
        this.workspaceEngine = workspaceEngine;
        const dir = path.join(this.workspaceRoot, ".brain", "workflows", this.workflowId);
        this.journalPath = path.join(dir, "journal.jsonl");
        this.events = this.read();
    }
    getFilePath() {
        return this.journalPath;
    }
    async log(type, payload = {}) {
        const event = {
            type,
            timestamp: new Date().toISOString(),
            payload
        };
        this.events.push(event);
        // Ensure target directory exists via workspace engine
        const dir = path.dirname(this.journalPath);
        if (!fs.existsSync(dir)) {
            const txDir = this.workspaceEngine.beginTransaction();
            this.workspaceEngine.stage(txDir.id, {
                kind: "CreateDirectory",
                path: dir,
                recursive: true
            });
            await this.workspaceEngine.commit(txDir.id);
        }
        // Write using WorkspaceEngine
        const fileContent = this.events.map(e => JSON.stringify(e)).join("\n") + "\n";
        const tx = this.workspaceEngine.beginTransaction();
        this.workspaceEngine.stage(tx.id, {
            kind: "WriteFile",
            path: this.journalPath,
            content: fileContent
        });
        await this.workspaceEngine.commit(tx.id);
        return event;
    }
    read() {
        if (!fs.existsSync(this.journalPath)) {
            return [];
        }
        try {
            const content = fs.readFileSync(this.journalPath, "utf8");
            return content
                .split("\n")
                .filter(line => line.trim().length > 0)
                .map(line => {
                try {
                    return JSON.parse(line);
                }
                catch {
                    return null;
                }
            })
                .filter((e) => e !== null);
        }
        catch {
            return [];
        }
    }
    async clear() {
        this.events = [];
        if (fs.existsSync(this.journalPath)) {
            const tx = this.workspaceEngine.beginTransaction();
            this.workspaceEngine.stage(tx.id, {
                kind: "DeleteFile",
                path: this.journalPath
            });
            await this.workspaceEngine.commit(tx.id);
        }
    }
}
