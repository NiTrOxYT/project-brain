// ──────────────────────────────────────────────────────────────────────────────
// BUILD-048 — Workspace Execution Engine — Journal
// Append-only audit log. Records every workspace operation permanently.
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { WorkspaceJournalEntry, WorkspaceJournalAction } from "./workspace-types.js";

export class WorkspaceJournal {
    private readonly journalPath: string;
    private entryCount = 0;

    constructor(stateDirectory: string) {
        this.journalPath = path.join(stateDirectory, "journal.jsonl");
        // Count existing entries
        try {
            if (fs.existsSync(this.journalPath)) {
                const lines = fs.readFileSync(this.journalPath, "utf-8").split("\n");
                this.entryCount = lines.filter(l => l.trim()).length;
            }
        } catch {}
    }

    append(entry: WorkspaceJournalEntry): void {
        try {
            const dir = path.dirname(this.journalPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.appendFileSync(this.journalPath, JSON.stringify(entry) + "\n");
            this.entryCount++;
        } catch (err) {
            // Journal writes must never crash the engine
        }
    }

    readAll(): WorkspaceJournalEntry[] {
        const entries: WorkspaceJournalEntry[] = [];
        try {
            if (!fs.existsSync(this.journalPath)) return entries;
            const lines = fs.readFileSync(this.journalPath, "utf-8").split("\n");
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    entries.push(JSON.parse(line) as WorkspaceJournalEntry);
                } catch {}
            }
        } catch {}
        return entries;
    }

    readTransaction(transactionId: string): WorkspaceJournalEntry[] {
        return this.readAll().filter(e => e.transactionId === transactionId);
    }

    get size(): number {
        return this.entryCount;
    }

    /** Convenience: record a journal entry with current timestamp */
    record(
        transactionId: string,
        action: WorkspaceJournalAction,
        details?: Partial<Omit<WorkspaceJournalEntry, "transactionId" | "action" | "timestamp">>
    ): void {
        this.append({
            transactionId,
            action,
            timestamp: new Date().toISOString(),
            ...details
        });
    }
}
