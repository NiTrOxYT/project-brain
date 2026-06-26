export const DEFAULT_WEIGHTS = {
    semantic: 0.28,
    execution: 0.20,
    relationships: 0.12,
    graph: 0.12,
    architecture: 0.08,
    evolution: 0.10,
    learning: 0.10
};
export class WeightedFusionStrategy {
    weights;
    constructor(weights = DEFAULT_WEIGHTS) {
        this.weights = weights;
    }
    score(candidate) {
        const sig = candidate.signals;
        return (sig.semantic * this.weights.semantic +
            sig.execution * this.weights.execution +
            sig.relationships * this.weights.relationships +
            sig.graph * this.weights.graph +
            sig.architecture * this.weights.architecture +
            sig.evolution * this.weights.evolution +
            (sig.learning ?? 0) * (this.weights.learning ?? 0));
    }
}
