import { FusionStrategy, FusionWeights, KnowledgeCandidate } from "./types";

export const DEFAULT_WEIGHTS: FusionWeights = {
    semantic: 0.315,
    execution: 0.225,
    relationships: 0.135,
    graph: 0.135,
    architecture: 0.09,
    evolution: 0.10
};

export class WeightedFusionStrategy implements FusionStrategy {
    constructor(public readonly weights: FusionWeights = DEFAULT_WEIGHTS) {}

    score(candidate: KnowledgeCandidate): number {
        const sig = candidate.signals;
        return (
            sig.semantic * this.weights.semantic +
            sig.execution * this.weights.execution +
            sig.relationships * this.weights.relationships +
            sig.graph * this.weights.graph +
            sig.architecture * this.weights.architecture +
            sig.evolution * this.weights.evolution
        );
    }
}
