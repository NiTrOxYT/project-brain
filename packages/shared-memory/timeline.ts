import fs from "fs/promises";
import path from "path";
import { MemoryEvent, MemoryTimeline } from "./types.js";
import { TimelineError } from "./errors.js";

export class CollaborationTimeline {
    private readonly timelinePath: string;
    private readonly events: MemoryEvent[] = [];

    constructor(workspaceRoot: string) {
        this.timelinePath = path.join(
            workspaceRoot, ".brain", "shared-memory", "timeline.jsonl"
        );
    }

    async append(type: string, agentId?: string, payload: any = {}): Promise<MemoryEvent> {
        const event: MemoryEvent = {
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
        } catch (err: any) {
            throw new TimelineError(`Failed to persist timeline event: ${err.message}`);
        }

        return event;
    }

    async load(): Promise<MemoryTimeline> {
        try {
            const raw = await fs.readFile(this.timelinePath, "utf8");
            const lines = raw.trim().split("\n").filter(Boolean);
            const events = lines.map(l => JSON.parse(l) as MemoryEvent);
            return { events };
        } catch {
            return { events: [] };
        }
    }

    getEvents(): MemoryEvent[] {
        return this.events;
    }
}
