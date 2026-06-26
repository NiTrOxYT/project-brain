export const DEFAULT_WEIGHTS = {
    semantic: 0.315,
    execution: 0.225,
    relationships: 0.135,
    graph: 0.135,
    architecture: 0.09,
    evolution: 0.10
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
            sig.evolution * this.weights.evolution);
    }
}
