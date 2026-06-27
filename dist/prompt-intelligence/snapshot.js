import fs from "fs/promises";
import path from "path";
import { PromptEngineError } from "./errors.js";
export class PromptSnapshotManager {
    workspaceRoot;
    promptsDir;
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.promptsDir = path.join(workspaceRoot, ".brain", "prompts");
    }
    async ensureDirectory() {
        await fs.mkdir(this.promptsDir, { recursive: true });
    }
    async save(promptPackage) {
        await this.ensureDirectory();
        let maxIndex = 0;
        try {
            const files = await fs.readdir(this.promptsDir);
            for (const file of files) {
                const match = file.match(/^prompt-(\d+)\.json$/);
                if (match) {
                    const idx = parseInt(match[1], 10);
                    if (idx > maxIndex) {
                        maxIndex = idx;
                    }
                }
            }
        }
        catch { }
        const nextIndex = maxIndex + 1;
        const filename = `prompt-${String(nextIndex).padStart(5, "0")}.json`;
        const filePath = path.join(this.promptsDir, filename);
        const snapshot = {
            id: filename.replace(".json", ""),
            promptPackage,
            timestamp: new Date().toISOString()
        };
        await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2), "utf8");
        return filename;
    }
    async load(id) {
        const filename = id.endsWith(".json") ? id : `${id}.json`;
        const filePath = path.join(this.promptsDir, filename);
        try {
            const raw = await fs.readFile(filePath, "utf8");
            const snapshot = JSON.parse(raw);
            return snapshot.promptPackage;
        }
        catch (err) {
            try {
                const files = await fs.readdir(this.promptsDir);
                for (const file of files) {
                    if (file.endsWith(".json")) {
                        const raw = await fs.readFile(path.join(this.promptsDir, file), "utf8");
                        const snapshot = JSON.parse(raw);
                        if (snapshot.promptPackage?.metadata?.hash === id ||
                            snapshot.promptPackage?.id === id) {
                            return snapshot.promptPackage;
                        }
                    }
                }
            }
            catch { }
            throw new PromptEngineError(`Failed to load snapshot ${id}: ${err.message}`);
        }
    }
    async list() {
        await this.ensureDirectory();
        try {
            const files = await fs.readdir(this.promptsDir);
            return files.filter(f => f.match(/^prompt-\d+\.json$/)).sort();
        }
        catch {
            return [];
        }
    }
    async compare(id1, id2) {
        const p1 = await this.load(id1);
        const p2 = await this.load(id2);
        const { PromptDiffEngine } = await import("./diff.js");
        return new PromptDiffEngine().diff(p1, p2);
    }
}
