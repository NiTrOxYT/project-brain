// ──────────────────────────────────────────────────────────────────────────────
// BUILD-051 — Autonomous Execution Loop — Journaling
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import { StoragePaths } from "../kernel/paths.js";
export class ExecutionJournalService {
    journalPath;
    constructor(workspaceRoot, planId) {
        const dir = new StoragePaths(workspaceRoot).journalDir;
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        this.journalPath = path.join(dir, `journal-${planId}.jsonl`);
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
        fs.appendFileSync(this.journalPath, JSON.stringify(event) + "\n", "utf8");
        return event;
    }
    read() {
        if (!fs.existsSync(this.journalPath)) {
            return [];
        }
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
    clear() {
        try {
            if (fs.existsSync(this.journalPath)) {
                fs.unlinkSync(this.journalPath);
            }
        }
        catch { }
    }
}
