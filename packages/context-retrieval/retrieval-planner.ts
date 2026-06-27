import { ParsedQuery } from "./query-parser";
import { RetrievalStrategy } from "./types";

export interface RetrievalPlan {
    strategy: RetrievalStrategy;
    stages: string[];
    primaryTargets: string[];
    symbolsToRetrieve: string[];
    expansionDepth: number;
    budgetLimit: number;
}

export class RetrievalPlanner {
    plan(parsed: ParsedQuery, strategyOverride?: RetrievalStrategy, depthOverride?: number): RetrievalPlan {
        let strategy: RetrievalStrategy = "hybrid";
        const stages = [
            "Primary Targets",
            "Dependencies",
            "Architecture",
            "Learning",
            "Relationships",
            "Expansion",
            "Ranking",
            "Budget",
            "Compression"
        ];

        // Infer strategy based on intent
        if (parsed.intent === "Architecture") {
            strategy = "architecture-centric";
        } else if (parsed.intent === "Repair" || parsed.intent === "Bug") {
            strategy = "learning-centric";
        } else if (parsed.intent === "Dependency") {
            strategy = "dependency-centric";
        } else if (parsed.targetFiles.length > 0) {
            strategy = "target-centric";
        }

        if (strategyOverride) {
            strategy = strategyOverride;
        }

        const expansionDepth = depthOverride !== undefined ? depthOverride : 2;

        return {
            strategy,
            stages,
            primaryTargets: parsed.targetFiles,
            symbolsToRetrieve: parsed.targetSymbols,
            expansionDepth,
            budgetLimit: 30000 // default budget in tokens
        };
    }
}
