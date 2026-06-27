// ──────────────────────────────────────────────────────────────────────────────
// BUILD-051 — Autonomous Execution Loop — Journaling
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { JournalEvent } from "./types.js";
import { StoragePaths } from "../kernel/paths.js";

export class ExecutionJournalService {
    private readonly journalPath: string;

    constructor(workspaceRoot: string, planId: string) {
        const dir = new StoragePaths(workspaceRoot).journalDir;
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        this.journalPath = path.join(dir, `journal-${planId}.jsonl`);
    }

    getFilePath(): string {
        return this.journalPath;
    }

    async log(type: JournalEvent["type"], payload: Record<string, any> = {}): Promise<JournalEvent> {
        const event: JournalEvent = {
            type,
            timestamp: new Date().toISOString(),
            payload
        };
        fs.appendFileSync(this.journalPath, JSON.stringify(event) + "\n", "utf8");
        return event;
    }

    read(): JournalEvent[] {
        if (!fs.existsSync(this.journalPath)) {
            return [];
        }
        const content = fs.readFileSync(this.journalPath, "utf8");
        return content
            .split("\n")
            .filter(line => line.trim().length > 0)
            .map(line => {
                try {
                    return JSON.parse(line) as JournalEvent;
                } catch {
                    return null;
                }
            })
            .filter((e): e is JournalEvent => e !== null);
    }

    clear(): void {
        try {
            if (fs.existsSync(this.journalPath)) {
                fs.unlinkSync(this.journalPath);
            }
        } catch {}
    }
}
