// ──────────────────────────────────────────────────────────────────────────────
// BUILD-052 — Learning Engine — Repair Patterns Learner
// ──────────────────────────────────────────────────────────────────────────────
export class RepairPatternsLearner {
    learn(experiences, existing) {
        const patternsMap = new Map();
        for (const p of existing) {
            patternsMap.set(p.id, { ...p, evidence: [...p.evidence] });
        }
        for (const exp of experiences) {
            if (exp.repairCycles === 0 || !exp.errors || exp.errors.length === 0) {
                continue;
            }
            for (const err of exp.errors) {
                const info = this.parseError(err);
                if (!info)
                    continue;
                const { errorType, pattern, recommendedFix } = info;
                const patternId = `${exp.providerId}-${errorType}-${pattern.replace(/[^a-z0-9]+/gi, "-").substring(0, 50)}`.toLowerCase();
                let p = patternsMap.get(patternId);
                const evidenceRef = {
                    executionId: exp.id,
                    timestamp: exp.timestamp
                };
                if (!p) {
                    p = {
                        id: patternId,
                        errorType,
                        errorMessagePattern: pattern,
                        recommendedFix,
                        providerId: exp.providerId,
                        successCount: 0,
                        totalCount: 0,
                        averageDurationMs: 0,
                        confidence: 0,
                        evidence: []
                    };
                    patternsMap.set(patternId, p);
                }
                // Avoid duplicate evidence
                if (!p.evidence.some(e => e.executionId === exp.id)) {
                    p.evidence.push(evidenceRef);
                    p.totalCount++;
                    if (exp.outcome === "success") {
                        p.successCount++;
                    }
                    // Rolling average duration
                    const n = p.totalCount;
                    p.averageDurationMs = Math.round((p.averageDurationMs * (n - 1) + exp.durationMs) / n);
                    // Confidence formula: (successCount / totalCount) * min(1.0, totalCount / 3)
                    // (Requires at least 3 samples for full confidence weighting)
                    const ratio = p.successCount / p.totalCount;
                    const volumeWeight = Math.min(1.0, p.totalCount / 3);
                    p.confidence = parseFloat((ratio * volumeWeight).toFixed(2));
                }
            }
        }
        return Array.from(patternsMap.values());
    }
    parseError(err) {
        const clean = err.trim();
        if (!clean)
            return null;
        if (clean.includes("Cannot find module")) {
            return {
                errorType: "DependencyError",
                pattern: "Cannot find module",
                recommendedFix: "Run npm install for the missing dependency"
            };
        }
        if (clean.includes("does not exist on type") || clean.includes("is not assignable to type")) {
            return {
                errorType: "TypeError",
                pattern: "Property/Type mismatch",
                recommendedFix: "Verify interface exports or cast correctly"
            };
        }
        if (clean.includes("AssertionError") || clean.includes("expected") && clean.includes("got")) {
            return {
                errorType: "TestFailure",
                pattern: "Assertion mismatch",
                recommendedFix: "Verify output matches mock predictions in specification"
            };
        }
        if (clean.includes("Address already in use") || clean.includes("EADDRINUSE")) {
            return {
                errorType: "PortConflict",
                pattern: "Address already in use",
                recommendedFix: "Terminate conflicting background processes or use free port"
            };
        }
        if (clean.includes("timeout") || clean.includes("timed out")) {
            return {
                errorType: "TimeoutError",
                pattern: "Execution timed out",
                recommendedFix: "Increase timeout bounds or optimize execution parameters"
            };
        }
        // Generic catch-all: use first line of error
        const firstLine = clean.split("\n")[0].substring(0, 100);
        return {
            errorType: "GenericRuntimeError",
            pattern: firstLine,
            recommendedFix: "Check code logs for exception stack trace and retry"
        };
    }
}
