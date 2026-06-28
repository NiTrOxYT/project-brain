// ──────────────────────────────────────────────────────────────────────────────
// BUILD-069 — Provider Event Logger
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";

export interface ProviderEvent {
    timestamp:  string;
    providerId: string;
    event:      "installed" | "configured" | "migrated" | "repaired" | "verified" | "audit passed" | "audit failed" | "configuration restored" | "version changed";
    details?:   any;
}

export class ProviderEventLogger {
    private static getLogPath(workspaceRoot?: string): string {
        const root = workspaceRoot ?? process.cwd();
        return path.join(root, ".brain", "provider-events.jsonl");
    }

    static logEvent(
        providerId: string,
        event: ProviderEvent["event"],
        details?: any,
        workspaceRoot?: string
    ): void {
        const filePath = this.getLogPath(workspaceRoot);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const logEntry: ProviderEvent = {
            timestamp: new Date().toISOString(),
            providerId,
            event,
            details
        };

        const line = JSON.stringify(logEntry) + "\n";
        fs.appendFileSync(filePath, line, "utf-8");
    }

    static queryEvents(providerId: string, workspaceRoot?: string): ProviderEvent[] {
        const filePath = this.getLogPath(workspaceRoot);
        if (!fs.existsSync(filePath)) return [];
        try {
            const content = fs.readFileSync(filePath, "utf-8");
            return content.split("\n")
                .filter(l => l.trim() !== "")
                .map(l => JSON.parse(l))
                .filter((e: ProviderEvent) => e.providerId === providerId);
        } catch {
            return [];
        }
    }
}
