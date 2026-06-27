import {

    BudgetRequest,

    BudgetResult,

    ContextCandidate

} from "./types.js";

export class ContextBudgetService {

    budget(
        request: BudgetRequest
    ): BudgetResult {

        const ranked = [...request.candidates]

            .sort(

                (a, b) =>

                    b.score - a.score

            );

        const selected: ContextCandidate[] = [];

        let usedTokens = 0;

        for (const file of ranked) {

            if (

                usedTokens +

                file.estimatedTokens >

                request.maxTokens

            ) {

                continue;

            }

            selected.push(file);

            usedTokens +=

                file.estimatedTokens;

        }

        return {

            files: selected,

            usedTokens,

            remainingTokens:

                request.maxTokens -

                usedTokens

        };

    }

}
