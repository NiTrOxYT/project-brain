export class RetrieverScorer {
    scores = new Map();
    add(file, value, reason) {
        if (!this.scores.has(file)) {
            this.scores.set(file, {
                file,
                score: 0,
                reasons: []
            });
        }
        const result = this.scores.get(file);
        result.score += value;
        result.reasons.push(reason);
    }
    results() {
        return [...this.scores.values()]
            .sort((a, b) => b.score - a.score);
    }
}
