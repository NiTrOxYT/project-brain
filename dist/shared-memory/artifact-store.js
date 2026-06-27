export class ArtifactStore {
    model;
    constructor(model) {
        this.model = model;
    }
    store(artifact) {
        const fullArtifact = {
            ...artifact,
            id: `artifact-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString()
        };
        this.model.addArtifact(fullArtifact);
        return fullArtifact;
    }
    get(id) {
        const state = this.model.getState();
        return state.artifacts.find(a => a.id === id) || null;
    }
    list() {
        const state = this.model.getState();
        return state.artifacts;
    }
    listForTask(taskId) {
        const state = this.model.getState();
        return state.artifacts.filter(a => a.taskId === taskId);
    }
}
