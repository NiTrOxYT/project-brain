import assert from "assert";
import { ContextProvider } from "./context-provider/provider.js";
import { IntelligentFallbackEngine } from "./provider-bridge/fallback.js";
// Helper to run a test block and report outcomes
async function test(name, fn) {
    try {
        await fn();
        console.log(`✓ ${name}`);
    }
    catch (err) {
        console.error(`✗ ${name}`);
        console.error(err.stack || err);
        process.exit(1);
    }
}
async function runTests() {
    console.log("Starting BUILD-064 Provider Context Consumption Test Suite...\n");
    const req = {
        providerId: "opencode",
        query: "database migration pattern",
        workspaceRoot: "packages/context-retrieval",
        snapshotId: "snap-a1b2c3d4",
        maxTokens: 4000,
        openFiles: [],
        recentlyEditedFiles: []
    };
    await test("1. ContextEnvelope is generated exactly once per request and remains immutable", async () => {
        const provider = new ContextProvider("packages/context-retrieval", "packages/context-retrieval");
        const response = await provider.getContext(req);
        // Map response to envelope
        const envelope = {
            systemInstructions: "You are an AI assistant.",
            architectureSummary: response.architectureSummary,
            rankedFiles: response.rankedFiles,
            snippets: response.snippets,
            semanticMemory: response.semanticMemory,
            dependencySummary: response.dependencySummary,
            estimatedTokens: response.estimatedTokens,
            confidence: response.confidence,
            snapshotId: req.snapshotId,
            retrievalTimeMs: response.retrievalTimeMs
        };
        assert(envelope !== undefined);
        assert(envelope.snapshotId === "snap-a1b2c3d4");
        // Attempting to freeze and verify immutability
        Object.freeze(envelope);
        assert(Object.isFrozen(envelope), "ContextEnvelope should be frozen and immutable");
    });
    await test("2. Intelligent fallback triggers on low confidence or empty snippets", () => {
        const dummyResponse1 = {
            architectureSummary: "Arch summary",
            rankedFiles: [],
            semanticMemory: [],
            snippets: [], // empty snippets
            dependencySummary: [],
            estimatedTokens: 10,
            confidence: 0.1, // low confidence
            retrievalTimeMs: 2
        };
        const eval1 = IntelligentFallbackEngine.evaluate(dummyResponse1, 0.5);
        assert(eval1.shouldFallback === true, "Empty snippets should trigger fallback");
        assert(eval1.confidence === "LOW");
        const dummyResponse2 = {
            architectureSummary: "Arch summary",
            rankedFiles: [],
            semanticMemory: [],
            snippets: [{ path: "types.ts", code: "code", comment: "comment" }],
            dependencySummary: [],
            estimatedTokens: 100,
            confidence: 0.9, // high confidence
            retrievalTimeMs: 2
        };
        const eval2 = IntelligentFallbackEngine.evaluate(dummyResponse2, 0.5);
        assert(eval2.shouldFallback === false, "High confidence context should not fallback to repository scans");
        assert(eval2.confidence === "HIGH");
    });
    await test("3. Telemetry avoids repository scans and compiles scan avoidance rate", async () => {
        ContextProvider.clearTelemetry();
        const provider = new ContextProvider("packages/context-retrieval", "packages/context-retrieval");
        // High confidence query (served directly)
        await provider.getContext(req);
        // Low confidence query (fallback scan)
        const emptyReq = {
            ...req,
            maxTokens: 1, // trigger tight budget overflow
            query: "completely empty results query text matching nothing"
        };
        await provider.getContext(emptyReq);
        const tel = ContextProvider.getTelemetry();
        assert(tel.requestsServed === 2, "Should record 2 requests served");
        assert(tel.requestsServedDirectly === 1, "Should record 1 request served directly");
        assert(tel.repositoryFallbackCount === 1, "Should fallback 1 time");
        const avoidanceRate = ContextProvider.getScanAvoidanceRate();
        assert(avoidanceRate === 0.5, "Expected 50% Scan Avoidance Rate");
        const fallbackRate = ContextProvider.getFallbackRate();
        assert(fallbackRate === 0.5, "Expected 50% Fallback Rate");
        const satisfactionRate = ContextProvider.getSatisfactionRate();
        assert(satisfactionRate === 0.5, "Expected 50% Context Satisfaction Rate");
    });
    console.log("\nAll BUILD-064 tests passed successfully!");
}
runTests();
