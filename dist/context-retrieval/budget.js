export class RetrievalBudgeter {
    providerBudgets = {
        "claude-code": 80000,
        "codex": 30000,
        "gemini-cli": 120000,
        "ollama": 16000,
        "aider": 20000,
        "opencode": 24000,
        "mock-sdk-provider": 50000
    };
    allocate(sections, providerId = "claude-code", maxTokensOverride) {
        const limit = maxTokensOverride || this.providerBudgets[providerId] || 40000;
        // Allocation configuration (ratios/caps in tokens)
        const allocated = {
            system: Math.floor(limit * 0.1),
            task: Math.floor(limit * 0.1),
            architecture: Math.floor(limit * 0.15),
            files: Math.floor(limit * 0.4),
            symbols: Math.floor(limit * 0.1),
            relationships: Math.floor(limit * 0.05),
            learning: Math.floor(limit * 0.05),
            validation: Math.floor(limit * 0.05)
        };
        const actual = {
            system: 0,
            task: 0,
            architecture: 0,
            files: 0,
            symbols: 0,
            relationships: 0,
            learning: 0,
            validation: 0
        };
        // Sort sections by priority ascending (lowest priority value = highest importance)
        const sorted = [...sections].sort((a, b) => {
            if (a.priority !== b.priority)
                return a.priority - b.priority;
            return a.id.localeCompare(b.id);
        });
        const allocatedSections = [];
        let runningTokens = 0;
        for (const s of sorted) {
            const tokens = s.estimatedTokens;
            // Enforce hard constraint check
            if (runningTokens + tokens > limit) {
                // If it is a critical system/task section, we must try to keep it,
                // but if we cannot, we throw a Budget Error or drop it if low priority.
                if (s.priority <= 20) {
                    // Critical section: keep it but log warning or throw if overflow is too large
                    allocatedSections.push(s);
                    runningTokens += tokens;
                    this.addActual(actual, s.kind, tokens);
                }
                else {
                    // Drop it
                    continue;
                }
            }
            else {
                allocatedSections.push(s);
                runningTokens += tokens;
                this.addActual(actual, s.kind, tokens);
            }
        }
        const budget = {
            maxTokens: limit,
            allocated,
            actual
        };
        return {
            allocatedSections,
            budget
        };
    }
    addActual(actual, kind, tokens) {
        const lower = kind.toLowerCase();
        if (lower.includes("file")) {
            actual.files += tokens;
        }
        else if (lower.includes("symbol")) {
            actual.symbols += tokens;
        }
        else if (lower.includes("arch")) {
            actual.architecture += tokens;
        }
        else if (lower.includes("learn") || lower.includes("exp")) {
            actual.learning += tokens;
        }
        else if (lower.includes("relation") || lower.includes("dep")) {
            actual.relationships += tokens;
        }
        else if (lower.includes("task")) {
            actual.task += tokens;
        }
        else {
            actual.system += tokens;
        }
    }
}
