import fs from "fs/promises";
import path from "path";
import { TimelineError } from "./errors";
export class CollaborationTimeline {
    timelinePath;
    events = [];
    constructor(workspaceRoot) {
        this.timelinePath = path.join(workspaceRoot, ".brain", "shared-memory", "timeline.jsonl");
    }
    async append(type, agentId, payload = {}) {
        const event = {
            id: `evt-${Math.random().toString(36).substr(2, 9)}`,
            type,
            timestamp: new Date().toISOString(),
            agentId,
            payload
        };
        this.events.push(event);
        try {
            await fs.mkdir(path.dirname(this.timelinePath), { recursive: true });
            const line = JSON.stringify(event) + "\n";
            await fs.appendFile(this.timelinePath, line, "utf8");
        }
        catch (err) {
            throw new TimelineError(`Failed to persist timeline event: ${err.message}`);
        }
        return event;
    }
    async load() {
        try {
            const raw = await fs.readFile(this.timelinePath, "utf8");
            const lines = raw.trim().split("\n").filter(Boolean);
            const events = lines.map(l => JSON.parse(l));
            return { events };
        }
        catch {
            return { events: [] };
        }
    }
    getEvents() {
        return this.events;
    }
}
