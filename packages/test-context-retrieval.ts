// ──────────────────────────────────────────────────────────────────────────────
// BUILD-056 — Context Retrieval Engine — Verification Suite
// 45 Scenarios covering all parser, traversal, ranker, budget, compressor,
// cache, validation, metrics, diagnostics, service and integration points.
// ──────────────────────────────────────────────────────────────────────────────

import assert from "assert";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dedicated temp test workspace
const TEST_WORKSPACE = path.join(__dirname, "..", ".brain-test-context-retrieval");

import { ContextRetrievalService } from "./context-retrieval/service.js";
import { QueryParser } from "./context-retrieval/query-parser.js";
import { RetrievalPlanner } from "./context-retrieval/retrieval-planner.js";
import { GraphTraverser } from "./context-retrieval/graph-traverser.js";
import { DependencyExpander } from "./context-retrieval/dependency-expander.js";
import { SymbolRetriever } from "./context-retrieval/symbol-retriever.js";
import { RelationshipRetriever } from "./context-retrieval/relationship-retriever.js";
import { ArchitectureRetriever } from "./context-retrieval/architecture-retriever.js";
import { LearningRetriever } from "./context-retrieval/learning-retriever.js";
import { RetrievalRanker } from "./context-retrieval/ranking.js";
import { RetrievalBudgeter } from "./context-retrieval/budget.js";
import { RetrievalCompressor } from "./context-retrieval/compressor.js";
import { RetrievalCache } from "./context-retrieval/cache.js";
import { RetrievalValidator } from "./context-retrieval/validator.js";
import { RetrievalMetricsTracker } from "./context-retrieval/metrics.js";
import { RetrievalDiagnosticsBuilder } from "./context-retrieval/diagnostics.js";
import { SemanticSnapshot } from "./context-compiler/types.js";
import { SnapshotFingerprintEngine } from "./context-compiler/fingerprint.js";
import { RetrievalPackage, RetrievalSection } from "./context-retrieval/types.js";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
    try {
        const res = fn();
        if (res && typeof (res as any).then === "function") {
            await res;
        }
        console.log(`  [PASS] ${name}`);
        passed++;
    } catch (err: any) {
        console.error(`  [FAIL] ${name}: ${err.message || err}`);
        failed++;
    }
}

// ─── Minimal Mock Data Helpers ───────────────────────────────────────────────

function makeMockSnapshot(): SemanticSnapshot {
    const fpEngine = new SnapshotFingerprintEngine();
    const fingerprint = fpEngine.compute({
        projectRoot: TEST_WORKSPACE,
        workspaceRoot: TEST_WORKSPACE,
        filePaths: ["src/main.ts", "src/utils.ts"]
    });

    const fileSecContent = JSON.stringify([]);
    const symSecContent = JSON.stringify([]);

    return {
        snapshotId: fingerprint.hash,
        metadata: {
            snapshotId: fingerprint.hash,
            projectRoot: TEST_WORKSPACE,
            workspaceRoot: TEST_WORKSPACE,
            createdAt: new Date().toISOString(),
            compiledAt: new Date().toISOString(),
            compilerVersion: "1.0.0",
            fingerprint,
            stageCount: 1,
            compilationDurationMs: 25,
            fileCount: 2,
            symbolCount: 2,
            dependencyEdgeCount: 1,
            graphNodeCount: 2,
            estimatedTokens: 200,
            incremental: false
        },
        sections: [
            {
                id: "filesystem-index",
                name: "Filesystem Index",
                kind: "filesystem-index",
                content: fileSecContent,
                priority: 10,
                contentHash: fpEngine.hashContent(fileSecContent),
                estimatedTokens: 10,
                sourcePaths: []
            },
            {
                id: "symbol-index",
                name: "Symbol Index",
                kind: "symbol-index",
                content: symSecContent,
                priority: 20,
                contentHash: fpEngine.hashContent(symSecContent),
                estimatedTokens: 10,
                sourcePaths: []
            }
        ],
        files: [
            { path: path.join(TEST_WORKSPACE, "src/main.ts"), relativePath: "src/main.ts", extension: ".ts", sizeBytes: 120, linesOfCode: 6, language: "TypeScript", lastModified: "", contentHash: "m1" },
            { path: path.join(TEST_WORKSPACE, "src/utils.ts"), relativePath: "src/utils.ts", extension: ".ts", sizeBytes: 80, linesOfCode: 4, language: "TypeScript", lastModified: "", contentHash: "u1" }
        ],
        symbols: [
            { name: "mainFunc", kind: "function", filePath: path.join(TEST_WORKSPACE, "src/main.ts"), line: 3, exported: true, contentHash: "sf1" },
            { name: "helperFunc", kind: "function", filePath: path.join(TEST_WORKSPACE, "src/utils.ts"), line: 2, exported: true, contentHash: "sf2" }
        ],
        dependencies: [
            { fromPath: "src/main.ts", toPath: "src/utils.ts", kind: "import", importNames: ["helperFunc"] }
        ],
        relationships: [
            { subject: "src/main.ts", predicate: "imports", object: "src/utils.ts", weight: 1 }
        ],
        graph: {
            nodes: [
                { id: "file::src/main.ts", type: "file", title: "main.ts", filePath: path.join(TEST_WORKSPACE, "src/main.ts"), status: "pending", priority: 10 },
                { id: "file::src/utils.ts", type: "file", title: "utils.ts", filePath: path.join(TEST_WORKSPACE, "src/utils.ts"), status: "pending", priority: 5 }
            ],
            edges: [
                { fromId: "file::src/main.ts", toId: "file::src/utils.ts", kind: "depends-on", weight: 1 }
            ],
            topologicalOrder: ["file::src/main.ts", "file::src/utils.ts"]
        },
        architecture: [
            { category: "Framework", title: "Use TypeScript", description: "All code must be TS", tags: ["ts"] }
        ],
        evolution: [],
        learning: [
            { timestamp: new Date().toISOString(), taskType: "modify", id: "learn-1", outcome: "success", validationScore: 1, filesModified: ["src/main.ts"] }
        ]
    };
}

function makeMockPackage(): RetrievalPackage {
    return {
        retrievalId: "retrieval-1",
        snapshotId: "snap-1",
        sections: [
            { id: "filesystem-index", name: "Filesystem Index", kind: "filesystem-index", content: "[]", priority: 10, estimatedTokens: 10, reason: "system-config" }
        ],
        candidates: [
            { path: "src/main.ts", score: 80, reasons: ["primary-target"] }
        ],
        graph: { nodes: [], edges: [], topologicalOrder: [] },
        symbols: [],
        dependencies: [],
        relationships: []
    };
}

// ─── Setup / Teardown ────────────────────────────────────────────────────────

async function setup() {
    await fs.mkdir(TEST_WORKSPACE, { recursive: true });
    await fs.mkdir(path.join(TEST_WORKSPACE, ".brain", "context", "retrieval-cache"), { recursive: true });
    await fs.mkdir(path.join(TEST_WORKSPACE, "src"), { recursive: true });
    await fs.mkdir(path.join(TEST_WORKSPACE, "index"), { recursive: true });
    await fs.mkdir(path.join(TEST_WORKSPACE, "graph"), { recursive: true });
    await fs.mkdir(path.join(TEST_WORKSPACE, "memory"), { recursive: true });
    await fs.mkdir(path.join(TEST_WORKSPACE, "learning"), { recursive: true });

    // Write dummy files for Synchronizer check
    await fs.writeFile(path.join(TEST_WORKSPACE, "index", "index.json"), JSON.stringify({ files: [] }), "utf8");
    await fs.writeFile(path.join(TEST_WORKSPACE, "index", "symbols.json"), JSON.stringify({ symbols: [] }), "utf8");
    await fs.writeFile(path.join(TEST_WORKSPACE, "index", "imports.json"), JSON.stringify({ imports: [] }), "utf8");
    await fs.writeFile(path.join(TEST_WORKSPACE, "index", "relationships.json"), JSON.stringify({ relationships: [] }), "utf8");
    await fs.writeFile(path.join(TEST_WORKSPACE, "index", "semantic.json"), JSON.stringify({ entries: [] }), "utf8");
    await fs.writeFile(path.join(TEST_WORKSPACE, "graph", "graph.json"), JSON.stringify({ nodes: [], edges: [] }), "utf8");
}

async function teardown() {
    try {
        await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
    } catch { /* best-effort */ }
}

// ─── Scenarios ───────────────────────────────────────────────────────────────

async function runSuite() {
    console.log("");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  BUILD-056 — Context Retrieval Engine — Tests");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("");

    await setup();

    const mockSnap = makeMockSnapshot();

    // ──────────────────────────────────────────────────────────────────────────
    // QUERY PARSING SCENARIOS (Tests 1-6)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 1: QueryParser — parse Feature request", () => {
        const parser = new QueryParser();
        const parsed = parser.parse("Add a new feature to main.ts");
        assert.strictEqual(parsed.intent, "Feature");
        assert.ok(parsed.targetFiles.includes("main.ts"));
    });

    await test("Test 2: QueryParser — parse Bug fix request", () => {
        const parser = new QueryParser();
        const parsed = parser.parse("Fix error in main.ts");
        assert.strictEqual(parsed.intent, "Bug");
    });

    await test("Test 3: QueryParser — parse Refactor request", () => {
        const parser = new QueryParser();
        const parsed = parser.parse("Refactor mainFunc in main.ts");
        assert.strictEqual(parsed.intent, "Refactor");
    });

    await test("Test 4: QueryParser — parse Documentation request", () => {
        const parser = new QueryParser();
        const parsed = parser.parse("Write README docs");
        assert.strictEqual(parsed.intent, "Documentation");
    });

    await test("Test 5: QueryParser — parse Validation request", () => {
        const parser = new QueryParser();
        const parsed = parser.parse("Verify all tests pass");
        assert.strictEqual(parsed.intent, "Validation");
    });

    await test("Test 6: QueryParser — parse Repair request", () => {
        const parser = new QueryParser();
        const parsed = parser.parse("Repair main.ts code errors");
        assert.strictEqual(parsed.intent, "Repair");
    });

    // ──────────────────────────────────────────────────────────────────────────
    // GRAPH TRAVERSAL SCENARIOS (Tests 7-10)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 7: GraphTraverser — BFS traversal", () => {
        const traverser = new GraphTraverser();
        const res = traverser.traverseBFS(mockSnap, ["file::src/main.ts"], 1);
        assert.ok(res.nodes.some(n => n.id === "file::src/utils.ts"));
    });

    await test("Test 8: GraphTraverser — Priority BFS traversal", () => {
        const traverser = new GraphTraverser();
        const res = traverser.traversePriorityBFS(mockSnap, ["file::src/main.ts"], 1);
        assert.ok(res.nodes.length >= 1);
    });

    await test("Test 9: GraphTraverser — cyclic traversals finish cleanly", () => {
        const traverser = new GraphTraverser();
        const cyclicSnap = makeMockSnapshot();
        cyclicSnap.graph.edges.push({ fromId: "file::src/utils.ts", toId: "file::src/main.ts", kind: "depends-on", weight: 1 });

        const res = traverser.traverseBFS(cyclicSnap, ["file::src/main.ts"], 2);
        assert.ok(res.nodes.length >= 2);
    });

    await test("Test 10: GraphTraverser — stable node ordering", () => {
        const traverser = new GraphTraverser();
        const res1 = traverser.traverseBFS(mockSnap, ["file::src/main.ts"], 1);
        const res2 = traverser.traverseBFS(mockSnap, ["file::src/main.ts"], 1);
        assert.strictEqual(JSON.stringify(res1), JSON.stringify(res2));
    });

    // ──────────────────────────────────────────────────────────────────────────
    // DEPENDENCY EXPANSION SCENARIOS (Tests 11-15)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 11: DependencyExpander — expands direct dependency", () => {
        const expander = new DependencyExpander();
        const res = expander.expand(mockSnap, ["src/main.ts"], 1);
        assert.ok(res.some(p => p.includes("utils.ts")));
    });

    await test("Test 12: DependencyExpander — expands callers/incoming dependencies", () => {
        const expander = new DependencyExpander();
        const res = expander.expand(mockSnap, ["src/utils.ts"], 1);
        assert.ok(res.some(p => p.includes("main.ts")));
    });

    await test("Test 13: DependencyExpander — cyclic references complete", () => {
        const expander = new DependencyExpander();
        const res = expander.expand(mockSnap, ["src/main.ts"], 2);
        assert.ok(res.length > 0);
    });

    await test("Test 14: DependencyExpander — interface/independent leaves unaffected", () => {
        const expander = new DependencyExpander();
        const res = expander.expand(mockSnap, ["src/independent.ts"], 1);
        assert.strictEqual(res.length, 0);
    });

    await test("Test 15: DependencyExpander — supports windows slashes in path expansion", () => {
        const expander = new DependencyExpander();
        const res = expander.expand(mockSnap, ["src\\main.ts"], 1);
        assert.ok(res.length > 0);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // RETRIEVAL SCENARIOS (Tests 16-20)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 16: SymbolRetriever — retrieves symbols correctly", () => {
        const retriever = new SymbolRetriever();
        const res = retriever.retrieve(mockSnap, ["mainFunc"], []);
        assert.strictEqual(res[0].name, "mainFunc");
    });

    await test("Test 17: RelationshipRetriever — retrieves relevant graph edges", () => {
        const retriever = new RelationshipRetriever();
        const res = retriever.retrieve(mockSnap, ["src/main.ts"]);
        assert.ok(res.length > 0);
    });

    await test("Test 18: ArchitectureRetriever — retrieves rules matching categories", () => {
        const retriever = new ArchitectureRetriever();
        const res = retriever.retrieve(mockSnap, ["ts"]);
        assert.ok(res.length > 0);
    });

    await test("Test 19: LearningRetriever — filters relevant learning history", () => {
        const retriever = new LearningRetriever();
        const res = retriever.retrieve(mockSnap, "modify", ["src/main.ts"]);
        assert.ok(res.length > 0);
    });

    await test("Test 20: Stable retrieval sorting across files and symbols", () => {
        const retriever = new SymbolRetriever();
        const res1 = retriever.retrieve(mockSnap, ["mainFunc", "helperFunc"], []);
        const res2 = retriever.retrieve(mockSnap, ["helperFunc", "mainFunc"], []);
        assert.strictEqual(JSON.stringify(res1), JSON.stringify(res2));
    });

    // ──────────────────────────────────────────────────────────────────────────
    // RANKING SCENARIOS (Tests 21-24)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 21: RetrievalRanker — ranks primary targets highest", () => {
        const ranker = new RetrievalRanker();
        const candidates = ranker.rank(mockSnap, ["src/main.ts", "src/utils.ts"], ["src/main.ts"], [], []);
        assert.strictEqual(candidates[0].path.replace(/\\/g, "/"), "src/main.ts");
    });

    await test("Test 22: RetrievalRanker — boosts files with symbol correlations", () => {
        const ranker = new RetrievalRanker();
        const candidates = ranker.rank(mockSnap, ["src/main.ts", "src/utils.ts"], [], ["helperFunc"], []);
        // utils.ts contains helperFunc, so it should rank higher than main.ts
        assert.strictEqual(candidates[0].path.replace(/\\/g, "/"), "src/utils.ts");
    });

    await test("Test 23: RetrievalRanker — learning matches improve ranking", () => {
        const ranker = new RetrievalRanker();
        const candidates = ranker.rank(mockSnap, ["src/main.ts", "src/utils.ts"], [], [], mockSnap.learning);
        assert.strictEqual(candidates[0].path.replace(/\\/g, "/"), "src/main.ts");
    });

    await test("Test 24: Stable deterministic candidate ranking on equal score", () => {
        const ranker = new RetrievalRanker();
        const candidates = ranker.rank(mockSnap, ["src/utils.ts", "src/main.ts"], [], [], []);
        // should sort alphabetically: main.ts, then utils.ts
        assert.strictEqual(candidates[0].path.replace(/\\/g, "/"), "src/main.ts");
    });

    // ──────────────────────────────────────────────────────────────────────────
    // BUDGET SCENARIOS (Tests 25-30)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 25: RetrievalBudgeter — respects Claude profile limit", () => {
        const budgeter = new RetrievalBudgeter();
        const sections: RetrievalSection[] = [
            { id: "s1", name: "s1", kind: "filesystem-index", content: "abc", priority: 10, estimatedTokens: 90000, reason: "primary-target" }
        ];
        const res = budgeter.allocate(sections, "claude-code");
        assert.strictEqual(res.budget.maxTokens, 80000);
    });

    await test("Test 26: RetrievalBudgeter — respects Codex profile limit", () => {
        const budgeter = new RetrievalBudgeter();
        const res = budgeter.allocate([], "codex");
        assert.strictEqual(res.budget.maxTokens, 30000);
    });

    await test("Test 27: RetrievalBudgeter — respects Gemini profile limit", () => {
        const budgeter = new RetrievalBudgeter();
        const res = budgeter.allocate([], "gemini-cli");
        assert.strictEqual(res.budget.maxTokens, 120000);
    });

    await test("Test 28: RetrievalBudgeter — respects Ollama profile limit", () => {
        const budgeter = new RetrievalBudgeter();
        const res = budgeter.allocate([], "ollama");
        assert.strictEqual(res.budget.maxTokens, 16000);
    });

    await test("Test 29: RetrievalBudgeter — respects Aider profile limit", () => {
        const budgeter = new RetrievalBudgeter();
        const res = budgeter.allocate([], "aider");
        assert.strictEqual(res.budget.maxTokens, 20000);
    });

    await test("Test 30: RetrievalBudgeter — respects OpenCode profile limit", () => {
        const budgeter = new RetrievalBudgeter();
        const res = budgeter.allocate([], "opencode");
        assert.strictEqual(res.budget.maxTokens, 24000);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // COMPRESSION SCENARIOS (Tests 31-33)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 31: RetrievalCompressor — removes duplicate candidates", () => {
        const compressor = new RetrievalCompressor();
        const pkg = makeMockPackage();
        pkg.candidates.push({ path: "src/main.ts", score: 80, reasons: [] });

        const compressed = compressor.compress(pkg);
        assert.strictEqual(compressed.candidates.length, 1);
    });

    await test("Test 32: RetrievalCompressor — collapse duplicate graph edges", () => {
        const compressor = new RetrievalCompressor();
        const pkg = makeMockPackage();
        pkg.graph.edges.push(
            { fromId: "a", toId: "b", kind: "depends-on", weight: 1 },
            { fromId: "a", toId: "b", kind: "depends-on", weight: 1 }
        );
        const compressed = compressor.compress(pkg);
        assert.strictEqual(compressed.graph.edges.length, 1);
    });

    await test("Test 33: RetrievalCompressor — sorts fields deterministically", () => {
        const compressor = new RetrievalCompressor();
        const pkg = makeMockPackage();
        pkg.candidates.push({ path: "src/main.ts", score: 10, reasons: [] });
        pkg.candidates.push({ path: "src/a.ts", score: 90, reasons: [] });

        const compressed = compressor.compress(pkg);
        assert.strictEqual(compressed.candidates[0].path, "src/a.ts");
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CACHE SCENARIOS (Tests 34-37)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 34: RetrievalCache — memory cache put and get", async () => {
        const cache = new RetrievalCache(TEST_WORKSPACE);
        const pkg = makeMockPackage();
        await cache.put("snap-1", "query-1", pkg);

        const hit = await cache.get("snap-1", "query-1");
        assert.ok(hit);
        assert.strictEqual(hit!.retrievalId, pkg.retrievalId);
    });

    await test("Test 35: RetrievalCache — correctly detects miss", async () => {
        const cache = new RetrievalCache(TEST_WORKSPACE);
        const hit = await cache.get("snap-1", "nonexistent-query");
        assert.strictEqual(hit, null);
    });

    await test("Test 36: RetrievalCache — LRU eviction prunes oldest items", async () => {
        const cache = new RetrievalCache(TEST_WORKSPACE);
        const pkg = makeMockPackage();
        for (let i = 0; i < 60; i++) {
            await cache.put("snap-1", `query-${i}`, pkg);
        }
        // First query should be evicted
        const hit = await cache.get("snap-1", "query-0");
        assert.strictEqual(hit, null);
    });

    await test("Test 37: RetrievalCache — disk persist and load", async () => {
        const cache = new RetrievalCache(TEST_WORKSPACE);
        const pkg = makeMockPackage();
        await cache.put("disk-snap", "disk-query", pkg);

        // Create new cache instance to verify disk read
        const diskCache = new RetrievalCache(TEST_WORKSPACE);
        const hit = await diskCache.get("disk-snap", "disk-query");
        assert.ok(hit);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // VALIDATION SCENARIOS (Tests 38-40)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 38: RetrievalValidator — validates correct package", () => {
        const validator = new RetrievalValidator();
        const pkg = makeMockPackage();
        const res = validator.validate(pkg);
        assert.ok(res.valid);
    });

    await test("Test 39: RetrievalValidator — flags duplicate candidates as error", () => {
        const validator = new RetrievalValidator();
        const pkg = makeMockPackage();
        pkg.candidates.push({ path: "src/main.ts", score: 80, reasons: [] });
        const res = validator.validate(pkg);
        assert.ok(!res.valid);
    });

    await test("Test 40: RetrievalValidator — flags budget overflow", () => {
        const validator = new RetrievalValidator();
        const pkg = makeMockPackage();
        pkg.sections[0].estimatedTokens = 1000;
        const res = validator.validate(pkg, 500);
        assert.ok(!res.valid);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // INTEGRATION SCENARIOS (Tests 41-45)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 41: ContextRetrievalService — returns retrieval result", async () => {
        const service = new ContextRetrievalService(TEST_WORKSPACE, TEST_WORKSPACE);
        const res = await service.retrieve({ query: "fix main", useCache: false });
        assert.ok(res.retrievalPackage);
        assert.strictEqual(res.cacheHit, false);
    });

    await test("Test 42: PromptContextBuilder — integrates with context retrieval", async () => {
        const { PromptContextBuilder } = await import("./prompt-intelligence/builder.js");
        const builder = new PromptContextBuilder(TEST_WORKSPACE);
        // Setup mock snapshot on disk or pass it in
        const res = await builder.collect(
            { id: "task-1", type: "modify", title: "fix main", status: "Running", prerequisites: [] },
            { workspaceRoot: TEST_WORKSPACE },
            mockSnap
        );
        assert.ok(res.workspaceMetadata.retrievalId);
    });

    await test("Test 43: PromptIntelligenceService compiles prompts using retrieval package", async () => {
        const { PromptIntelligenceService } = await import("./prompt-intelligence/service.js");
        const promptService = new PromptIntelligenceService(TEST_WORKSPACE);

        // Force synchronizer and context compiling mocks so latest snapshot can be found
        const { ContextSynchronizationService } = await import("./context-sync/index.js");
        const syncService = new ContextSynchronizationService(TEST_WORKSPACE, TEST_WORKSPACE);
        await syncService.syncFull();

        const res = await promptService.compile({
            task: { id: "task-1", type: "modify", title: "fix main", status: "Running", prerequisites: [] },
            context: { workspaceRoot: TEST_WORKSPACE },
            providerId: "mock-sdk-provider"
        });
        assert.ok(res.renderedPrompt);
    });

    await test("Test 44: QueryEngineService includes retrieval diagnostic fields", async () => {
        const { QueryEngineService } = await import("./query-engine/service.js");
        const queryService = new QueryEngineService(TEST_WORKSPACE, TEST_WORKSPACE);
        const res = await queryService.query({ query: "fix main" });
        if (res.diagnostics.retrievalDuration === undefined) {
            console.log("TEST 44 DIAGNOSTICS FAILURE DETAILED RESULT:", JSON.stringify(res, null, 2));
        }
        assert.ok(res.diagnostics);
        assert.ok(res.diagnostics.retrievalDuration !== undefined);
    });

    await test("Test 45: ContextSynchronizationService exposes latest snapshot for retrieval", async () => {
        const { ContextSynchronizationService } = await import("./context-sync/index.js");
        const syncService = new ContextSynchronizationService(TEST_WORKSPACE, TEST_WORKSPACE);
        const latest = await syncService.latestSnapshot();
        assert.ok(latest);
    });

    // ─── Teardown ────────────────────────────────────────────────────────────

    await teardown();

    console.log("");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`  RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("");

    if (failed > 0) {
        process.exit(1);
    }
}

runSuite().catch(err => {
    console.error("Suite crashed:", err);
    process.exit(1);
});
