import assert from "assert";
import { ContextCache } from "./context-provider/cache.js";
import { TokenBudgetOptimizer } from "./context-provider/optimizer.js";
import { ContextProvider } from "./context-provider/provider.js";
import type { ContextRequest, ContextResponse } from "./context-provider/types.js";

// Helper to run a test block and report outcomes
async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
    try {
        await fn();
        console.log(`✓ ${name}`);
    } catch (err: any) {
        console.error(`✗ ${name}`);
        console.error(err.stack || err);
        process.exit(1);
    }
}

async function runTests() {
    console.log("Starting BUILD-063 Context Provider & Intelligent Retrieval Pipeline Test Suite...\n");

    const req: ContextRequest = {
        providerId:          "opencode",
        query:               "database config pattern",
        workspaceRoot:       "packages/context-retrieval",
        snapshotId:          "snap-a1b2c3d4",
        maxTokens:           4000,
        openFiles:           ["types.ts", "service.ts"],
        recentlyEditedFiles: ["service.ts"]
    };

    await test("1. Snapshot-aware cache invalidates correctly on snapshot changes", () => {
        ContextCache.clear();

        const dummyResponse: ContextResponse = {
            architectureSummary: "Arch info",
            rankedFiles:         [],
            semanticMemory:      [],
            snippets:            [],
            dependencySummary:   [],
            estimatedTokens:     100,
            confidence:          0.9,
            retrievalTimeMs:     5
        };

        // Cache response for snap-a1b2c3d4
        ContextCache.set("snap-a1b2c3d4", "database config pattern", ["types.ts", "service.ts"], dummyResponse);

        // Fetch using same snapshotId
        const hit = ContextCache.get("snap-a1b2c3d4", "database config pattern", ["types.ts", "service.ts"]);
        assert(hit !== undefined, "Expected cache hit");

        // Fetch using different snapshotId (should invalidate cache)
        const miss = ContextCache.get("snap-different", "database config pattern", ["types.ts", "service.ts"]);
        assert(miss === undefined, "Expected cache miss due to snapshot ID change invalidation");
    });

    await test("2. TokenBudgetOptimizer respects maxTokens limits and compiles mixtures", () => {
        const rawArch = "System architecture detail and dependency maps.";
        const rawFiles = [{ path: "types.ts", score: 0.9, reasons: ["primary"] }];
        const rawMemories = [{ id: "mem-1", type: "experience", content: "Remember to use try-catch.", confidence: 0.95 }];
        
        // Snippet length approx 160 chars -> 40 tokens
        const rawSnippets = [{ path: "types.ts", code: "export interface Action { type: string; }", comment: "Action type" }];
        const rawDeps = [{ file: "service.ts", imports: ["./types.js"] }];

        // Optimize with generous budget
        const res1 = TokenBudgetOptimizer.optimize(1000, rawArch, rawFiles, rawMemories, rawSnippets, rawDeps);
        assert(res1.architectureSummary === rawArch);
        assert(res1.snippets.length === 1);
        assert(res1.estimatedTokens <= 1000);

        // Optimize with tight budget (e.g. 5 tokens, which cannot fit architecture)
        const res2 = TokenBudgetOptimizer.optimize(5, rawArch, rawFiles, rawMemories, rawSnippets, rawDeps);
        assert(res2.architectureSummary === "", "Should skip architecture to fit budget");
        assert(res2.snippets.length === 0);
    });

    await test("3. ContextProvider getContext runs complete pipeline and returns high-confidence optimized results", async () => {
        ContextProvider.clearTelemetry();
        const provider = new ContextProvider("packages/context-retrieval", "packages/context-retrieval");
        
        const response = await provider.getContext(req);
        assert(response !== undefined);
        assert(response.confidence > 0.5, "Should return confident result");
        assert(response.estimatedTokens > 0);
        assert(response.retrievalTimeMs >= 0);
    });

    await test("4. Telemetry tracking compiles scan avoidance rate and savings", async () => {
        ContextProvider.clearTelemetry();
        const provider = new ContextProvider("packages/context-retrieval", "packages/context-retrieval");

        // 1st request (loads from resolver/retrieval service)
        await provider.getContext(req);

        // 2nd request (cache hit)
        await provider.getContext(req);

        const tel = ContextProvider.getTelemetry();
        assert(tel.requestsServed === 2, "Expected 2 served requests");
        assert(tel.requestsServedDirectly === 2, "Expected 2 requests served directly");

        const rate = ContextProvider.getScanAvoidanceRate();
        assert(rate === 1.0, "Scan avoidance rate should be 100%");
    });

    await test("5. ContextProvider remains authoritative source and controls fallbacks based on confidence", async () => {
        ContextProvider.clearTelemetry();
        const provider = new ContextProvider("packages/context-retrieval", "packages/context-retrieval");

        // Force a query that yields no snippets due to tight token limit, causing low confidence
        const emptyReq: ContextRequest = {
            ...req,
            maxTokens: 1,
            query: "completely empty results query pattern text that does not match anything"
        };

        const res = await provider.getContext(emptyReq);
        assert(res.confidence === 0.1, "Expected low confidence (0.1) for empty results");
        
        const tel = ContextProvider.getTelemetry();
        assert(tel.repositoryFallbackCount === 1, "Should increment fallback count on low confidence");
    });

    console.log("\nAll BUILD-063 tests passed successfully!");
}

runTests();
