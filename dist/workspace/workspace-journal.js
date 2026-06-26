// ──────────────────────────────────────────────────────────────────────────────
// BUILD-048 — Workspace Execution Engine — Journal
// Append-only audit log. Records every workspace operation permanently.
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
export class WorkspaceJournal {
    journalPath;
    entryCount = 0;
    constructor(stateDirectory) {
        this.journalPath = path.join(stateDirectory, "journal.jsonl");
        // Count existing entries
        try {
            if (fs.existsSync(this.journalPath)) {
                const lines = fs.readFileSync(this.journalPath, "utf-8").split("\n");
                this.entryCount = lines.filter(l => l.trim()).length;
            }
        }
        catch { }
    }
    append(entry) {
        try {
            const dir = path.dirname(this.journalPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.appendFileSync(this.journalPath, JSON.stringify(entry) + "\n");
            this.entryCount++;
        }
        catch (err) {
            // Journal writes must never crash the engine
        }
    }
    readAll() {
        const entries = [];
        try {
            if (!fs.existsSync(this.journalPath))
                return entries;
            const lines = fs.readFileSync(this.journalPath, "utf-8").split("\n");
            for (const line of lines) {
                if (!line.trim())
                    continue;
                try {
                    entries.push(JSON.parse(line));
                }
                catch { }
            }
        }
        catch { }
        return entries;
    }
    readTransaction(transactionId) {
        return this.readAll().filter(e => e.transactionId === transactionId);
    }
    get size() {
        return this.entryCount;
    }
    /** Convenience: record a journal entry with current timestamp */
    record(transactionId, action, details) {
        this.append({
            transactionId,
            action,
            timestamp: new Date().toISOString(),
            ...details
        });
    }
}
