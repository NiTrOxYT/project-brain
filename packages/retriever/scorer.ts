export interface Score {

    file: string;

    score: number;

    reasons: string[];

}

export class RetrieverScorer {

    private readonly scores =
        new Map<string, Score>();

    add(
        file: string,
        value: number,
        reason: string
    ) {

        if (!this.scores.has(file)) {

            this.scores.set(file, {

                file,

                score: 0,

                reasons: []

            });

        }

        const result =
            this.scores.get(file)!;

        result.score += value;

        result.reasons.push(reason);

    }

    results(): Score[] {

        return [...this.scores.values()]
            .sort(
                (a, b) =>
                    b.score - a.score
            );

    }

}
