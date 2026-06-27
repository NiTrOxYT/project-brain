export class RetrievalPlanner {
    plan(parsed, strategyOverride, depthOverride) {
        let strategy = "hybrid";
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
        }
        else if (parsed.intent === "Repair" || parsed.intent === "Bug") {
            strategy = "learning-centric";
        }
        else if (parsed.intent === "Dependency") {
            strategy = "dependency-centric";
        }
        else if (parsed.targetFiles.length > 0) {
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
