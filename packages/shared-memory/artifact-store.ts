import { AgentArtifact } from "./types";
import { SharedMemoryModel } from "./memory";

export class ArtifactStore {
    constructor(private readonly model: SharedMemoryModel) {}

    store(artifact: Omit<AgentArtifact, "id" | "timestamp">): AgentArtifact {
        const fullArtifact: AgentArtifact = {
            ...artifact,
            id: `artifact-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString()
        };
        this.model.addArtifact(fullArtifact);
        return fullArtifact;
    }

    get(id: string): AgentArtifact | null {
        const state = this.model.getState();
        return state.artifacts.find(a => a.id === id) || null;
    }

    list(): AgentArtifact[] {
        const state = this.model.getState();
        return state.artifacts;
    }

    listForTask(taskId: string): AgentArtifact[] {
        const state = this.model.getState();
        return state.artifacts.filter(a => a.taskId === taskId);
    }
}
