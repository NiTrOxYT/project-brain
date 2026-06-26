export interface ContextCandidate {

    path: string;

    score: number;

    estimatedTokens: number;

    symbols: number;

}

export interface BudgetRequest {

    candidates: ContextCandidate[];

    maxTokens: number;

}

export interface BudgetResult {

    files: ContextCandidate[];

    usedTokens: number;

    remainingTokens: number;

}
