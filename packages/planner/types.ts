export type ExecutionIntent =
    | "feature"
    | "bugfix"
    | "refactor"
    | "test"
    | "documentation"
    | "analysis";

export interface ExecutionPlan {

    originalQuery: string;

    normalizedQuery: string;

    intent: ExecutionIntent;

    keywords: string[];

    targetModules: string[];

    contextBudget: number;

    confidence: number;

}
