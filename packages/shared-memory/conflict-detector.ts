import { ConflictRecord } from "./types.js";
import { SharedMemoryModel } from "./memory.js";

export class ConflictDetector {
    constructor(private readonly model: SharedMemoryModel) {}

    detect(): ConflictRecord[] {
        const state = this.model.getState();
        const conflicts: ConflictRecord[] = [];

        // 1. Detect file collision (multiple agents generating artifacts for the same file path)
        const fileMap = new Map<string, string[]>();
        for (const art of state.artifacts) {
            const list = fileMap.get(art.filePath) || [];
            if (!list.includes(art.agentId)) {
                list.push(art.agentId);
            }
            fileMap.set(art.filePath, list);
        }

        for (const [filePath, agents] of fileMap.entries()) {
            if (agents.length > 1) {
                conflicts.push({
                    id: `conflict-file-${Math.random().toString(36).substr(2, 9)}`,
                    conflictType: "file_collision",
                    conflictingEntities: [filePath],
                    description: `Multiple agents (${agents.join(", ")}) modified the same file: ${filePath}`,
                    involvedAgents: agents,
                    timestamp: new Date().toISOString(),
                    status: "open"
                });
            }
        }

        // 2. Detect contradictory decisions
        const decisionMap = new Map<string, string[]>();
        for (const dec of state.decisions) {
            const list = decisionMap.get(dec.decision) || [];
            if (!list.includes(dec.approvedBy[0])) {
                list.push(dec.approvedBy[0]);
            }
            decisionMap.set(dec.decision, list);
        }

        for (const [decision, agents] of decisionMap.entries()) {
            if (agents.length > 1 && decision.toLowerCase().includes("conflict")) {
                conflicts.push({
                    id: `conflict-dec-${Math.random().toString(36).substr(2, 9)}`,
                    conflictType: "contradictory_decision",
                    conflictingEntities: [decision],
                    description: `Contradictory decisions made on: ${decision}`,
                    involvedAgents: agents,
                    timestamp: new Date().toISOString(),
                    status: "open"
                });
            }
        }

        // Save new conflicts to model if not already added
        for (const c of conflicts) {
            const exists = state.conflicts.some(ex =>
                ex.conflictType === c.conflictType &&
                JSON.stringify(ex.conflictingEntities) === JSON.stringify(c.conflictingEntities)
            );
            if (!exists) {
                this.model.addConflict(c);
            }
        }

        return state.conflicts.filter(c => c.status === "open");
    }
}
