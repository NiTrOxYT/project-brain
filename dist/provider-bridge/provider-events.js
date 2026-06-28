// ──────────────────────────────────────────────────────────────────────────────
// BUILD-069 — Provider Event Logger
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
export class ProviderEventLogger {
    static getLogPath(workspaceRoot) {
        const root = workspaceRoot ?? process.cwd();
        return path.join(root, ".brain", "provider-events.jsonl");
    }
    static logEvent(providerId, event, details, workspaceRoot) {
        const filePath = this.getLogPath(workspaceRoot);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const logEntry = {
            timestamp: new Date().toISOString(),
            providerId,
            event,
            details
        };
        const line = JSON.stringify(logEntry) + "\n";
        fs.appendFileSync(filePath, line, "utf-8");
    }
    static queryEvents(providerId, workspaceRoot) {
        const filePath = this.getLogPath(workspaceRoot);
        if (!fs.existsSync(filePath))
            return [];
        try {
            const content = fs.readFileSync(filePath, "utf-8");
            return content.split("\n")
                .filter(l => l.trim() !== "")
                .map(l => JSON.parse(l))
                .filter((e) => e.providerId === providerId);
        }
        catch {
            return [];
        }
    }
}
