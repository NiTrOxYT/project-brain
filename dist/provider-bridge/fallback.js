export class IntelligentFallbackEngine {
    static evaluate(response, threshold = 0.5) {
        const reasons = [];
        let confidence = "HIGH";
        if (response.confidence >= 0.8) {
            confidence = "HIGH";
        }
        else if (response.confidence >= 0.5) {
            confidence = "MEDIUM";
        }
        else {
            confidence = "LOW";
        }
        let shouldFallback = false;
        // Fallback condition 1: confidence is below configured threshold
        if (response.confidence < threshold) {
            shouldFallback = true;
            reasons.push(`Confidence (${response.confidence}) is below threshold (${threshold})`);
        }
        // Fallback condition 2: no snippets retrieved at all
        if (response.snippets.length === 0) {
            shouldFallback = true;
            reasons.push("No snippets returned from ContextProvider");
        }
        // Fallback condition 3: empty architecture summary
        if (!response.architectureSummary || response.architectureSummary.length === 0) {
            shouldFallback = true;
            reasons.push("Empty architecture summary");
        }
        return {
            confidence,
            shouldFallback,
            reasons
        };
    }
}
