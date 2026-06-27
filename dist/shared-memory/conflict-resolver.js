import { ConflictError } from "./errors.js";
export class ConflictResolver {
    model;
    constructor(model) {
        this.model = model;
    }
    resolve(conflict, resolvedByAgentId) {
        const state = this.model.getState();
        if (conflict.status === "resolved") {
            const existing = state.resolutions.get(conflict.id);
            if (existing)
                return existing;
        }
        // Determine winning entity based on priority rules:
        // Rule 1: Highest agent priority
        // Rule 2: Alphabetically sorted ID if priorities match
        const agents = conflict.involvedAgents.map(id => state.agents.get(id)).filter(Boolean);
        if (agents.length === 0) {
            throw new ConflictError(`Cannot resolve conflict '${conflict.id}' because involved agents could not be loaded.`);
        }
        agents.sort((a, b) => {
            if (b.priority !== a.priority)
                return b.priority - a.priority;
            return a.id.localeCompare(b.id);
        });
        const winnerAgent = agents[0];
        let winningEntity = "";
        if (conflict.conflictType === "file_collision") {
            const file = conflict.conflictingEntities[0];
            const matchingArtifact = state.artifacts.find(art => art.filePath === file && art.agentId === winnerAgent.id);
            winningEntity = matchingArtifact ? matchingArtifact.id : conflict.conflictingEntities[0];
        }
        else {
            winningEntity = conflict.conflictingEntities[0];
        }
        const resolution = {
            conflictId: conflict.id,
            winningEntity,
            resolvedByAgentId,
            resolutionRule: "highest-agent-priority-wins",
            timestamp: new Date().toISOString()
        };
        this.model.setResolution(resolution);
        conflict.status = "resolved";
        return resolution;
    }
}
