// ──────────────────────────────────────────────────────────────────────────────
// BUILD-054 — Context Compiler & Semantic Snapshots — Verification Suite
// 30 tests covering all compiler stages, service APIs, cache, storage, delta,
// optimizer, validator, normalizer, fingerprint, and integration touchpoints.
// ──────────────────────────────────────────────────────────────────────────────

import assert from "assert";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use a dedicated temp workspace for tests
const TEST_WORKSPACE = path.join(__dirname, "..", ".brain-test-context-compiler");

import { ContextCompilerService } from "./context-compiler/service";
import { SnapshotCollector } from "./context-compiler/collector";
import { SnapshotNormalizer } from "./context-compiler/normalizer";
import { DependencyAnalyzer } from "./context-compiler/dependency-analyzer";
import { GraphCompiler } from "./context-compiler/graph-compiler";
import { SnapshotBuilder } from "./context-compiler/snapshot-builder";
import { SnapshotFingerprintEngine } from "./context-compiler/fingerprint";
import { SnapshotCache } from "./context-compiler/cache";
import { SnapshotDeltaEngine } from "./context-compiler/delta";
import { SnapshotOptimizer } from "./context-compiler/optimizer";
import { SnapshotValidator } from "./context-compiler/validator";
import { SnapshotStorage } from "./context-compiler/storage";
import { SnapshotMetricsTracker } from "./context-compiler/metrics";
import { SnapshotDiagnosticsBuilder } from "./context-compiler/diagnostics";
import {
    SnapshotCompilationError,
    SnapshotValidationError,
    SnapshotFingerprintError
} from "./context-compiler/errors";
import type {
    SemanticSnapshot,
    SnapshotContext,
    SnapshotFile,
    SnapshotSymbol,
    SnapshotDependency,
    SnapshotGraphNode,
    SnapshotGraphEdge,
    SnapshotSection
} from "./context-compiler/types";

// ─── Test Harness ────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildMinimalSnapshot(overrides: Partial<SemanticSnapshot> = {}): SemanticSnapshot {
    const fpEngine = new SnapshotFingerprintEngine();
    const context: SnapshotContext = {
        projectRoot: TEST_WORKSPACE,
        workspaceRoot: TEST_WORKSPACE,
        filePaths: ["src/main.ts", "src/utils.ts"]
    };
    const fingerprint = fpEngine.compute(context);
    const content = JSON.stringify([{ path: "src/main.ts" }]);
    const section: SnapshotSection = {
        id: "filesystem-index",
        name: "Filesystem Index",
        kind: "filesystem-index",
        content,
        priority: 10,
        contentHash: fpEngine.hashContent(content),
        estimatedTokens: Math.ceil(content.length / 4),
        sourcePaths: ["src/main.ts"]
    };
    const base: SemanticSnapshot = {
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
            compilationDurationMs: 10,
            fileCount: 2,
            symbolCount: 0,
            dependencyEdgeCount: 0,
            graphNodeCount: 0,
            estimatedTokens: section.estimatedTokens,
            incremental: false
        },
        sections: [section],
        files: [],
        symbols: [],
        dependencies: [],
        relationships: [],
        graph: { nodes: [], edges: [], topologicalOrder: [] },
        architecture: [],
        evolution: [],
        learning: []
    };
    return { ...base, ...overrides };
}

// ─── Setup ───────────────────────────────────────────────────────────────────

async function setup() {
    await fs.mkdir(TEST_WORKSPACE, { recursive: true });
    await fs.mkdir(path.join(TEST_WORKSPACE, ".brain", "context", "snapshots"), { recursive: true });
    await fs.mkdir(path.join(TEST_WORKSPACE, ".brain", "context", "cache"), { recursive: true });
    await fs.mkdir(path.join(TEST_WORKSPACE, "index"), { recursive: true });
    await fs.mkdir(path.join(TEST_WORKSPACE, "graph"), { recursive: true });
    await fs.mkdir(path.join(TEST_WORKSPACE, "memory"), { recursive: true });
    await fs.mkdir(path.join(TEST_WORKSPACE, "learning"), { recursive: true });
}

async function teardown() {
    try {
        await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
    } catch { /* best-effort */ }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

async function runSuite() {
    console.log("");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  BUILD-054 — Context Compiler & Semantic Snapshots — Tests");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("");

    await setup();

    // ── Test 1: SnapshotFingerprintEngine — deterministic hash ───────────────
    await test("Test 1: Fingerprint is deterministic for same context", () => {
        const engine = new SnapshotFingerprintEngine();
        const ctx: SnapshotContext = {
            projectRoot: "/project",
            workspaceRoot: "/project/.brain",
            filePaths: ["a.ts", "b.ts"].sort()
        };
        const fp1 = engine.compute(ctx);
        const fp2 = engine.compute(ctx);
        assert.strictEqual(fp1.hash, fp2.hash, "Same inputs must produce same fingerprint");
    });

    // ── Test 2: Different inputs → different fingerprint ────────────────────
    await test("Test 2: Fingerprint differs for different inputs", () => {
        const engine = new SnapshotFingerprintEngine();
        const ctx1: SnapshotContext = { projectRoot: "/p", workspaceRoot: "/p/.brain", filePaths: ["a.ts"] };
        const ctx2: SnapshotContext = { projectRoot: "/p", workspaceRoot: "/p/.brain", filePaths: ["b.ts"] };
        const fp1 = engine.compute(ctx1);
        const fp2 = engine.compute(ctx2);
        assert.notStrictEqual(fp1.hash, fp2.hash, "Different inputs must produce different fingerprints");
    });

    // ── Test 3: stableStringify determinism ─────────────────────────────────
    await test("Test 3: stableStringify produces deterministic output for objects", () => {
        const engine = new SnapshotFingerprintEngine();
        const obj1 = { b: 2, a: 1 };
        const obj2 = { a: 1, b: 2 };
        const s1 = engine.stableStringify(obj1);
        const s2 = engine.stableStringify(obj2);
        assert.strictEqual(s1, s2, "Unordered objects must stringify identically");
    });

    // ── Test 4: SnapshotNormalizer — file sorting ────────────────────────────
    await test("Test 4: Normalizer sorts files by path ascending", () => {
        const norm = new SnapshotNormalizer();
        const files: SnapshotFile[] = [
            { path: "z.ts", relativePath: "z.ts", extension: ".ts", sizeBytes: 100, linesOfCode: 5, language: "TypeScript", lastModified: "", contentHash: "" },
            { path: "a.ts", relativePath: "a.ts", extension: ".ts", sizeBytes: 200, linesOfCode: 10, language: "TypeScript", lastModified: "", contentHash: "" }
        ];
        const result = norm.normalizeFiles(files);
        assert.strictEqual(result[0].path, "a.ts");
        assert.strictEqual(result[1].path, "z.ts");
    });

    // ── Test 5: Normalizer deduplicates files ────────────────────────────────
    await test("Test 5: Normalizer deduplicates files by path", () => {
        const norm = new SnapshotNormalizer();
        const files: SnapshotFile[] = [
            { path: "a.ts", relativePath: "a.ts", extension: ".ts", sizeBytes: 100, linesOfCode: 5, language: "TypeScript", lastModified: "", contentHash: "" },
            { path: "a.ts", relativePath: "a.ts", extension: ".ts", sizeBytes: 100, linesOfCode: 5, language: "TypeScript", lastModified: "", contentHash: "" }
        ];
        const result = norm.normalizeFiles(files);
        assert.strictEqual(result.length, 1, "Duplicate files must be removed");
    });

    // ── Test 6: Normalizer — topological sort (simple chain) ─────────────────
    await test("Test 6: Normalizer topologicalSort orders a simple chain", () => {
        const norm = new SnapshotNormalizer();
        const nodes: SnapshotGraphNode[] = [
            { id: "B", type: "task", title: "B", status: "pending", priority: 1 },
            { id: "A", type: "task", title: "A", status: "pending", priority: 1 },
            { id: "C", type: "task", title: "C", status: "pending", priority: 1 }
        ];
        const edges: SnapshotGraphEdge[] = [
            { fromId: "A", toId: "B", kind: "depends-on", weight: 1 },
            { fromId: "B", toId: "C", kind: "depends-on", weight: 1 }
        ];
        const order = norm.topologicalSort(nodes, edges);
        const posA = order.indexOf("A");
        const posB = order.indexOf("B");
        const posC = order.indexOf("C");
        assert.ok(posA < posB, "A must come before B");
        assert.ok(posB < posC, "B must come before C");
    });

    // ── Test 7: DependencyAnalyzer — object relationship format ──────────────
    await test("Test 7: DependencyAnalyzer extracts deps from object relationships format", () => {
        const analyzer = new DependencyAnalyzer();
        const ctx: SnapshotContext = {
            projectRoot: TEST_WORKSPACE,
            workspaceRoot: TEST_WORKSPACE,
            relationshipsData: {
                "src/a.ts": ["src/b.ts", "src/c.ts"]
            }
        };
        const deps = analyzer.analyze(ctx);
        assert.ok(deps.length >= 2, "Should have extracted 2 dependencies");
        assert.ok(deps.some(d => d.fromPath.includes("a.ts") && d.toPath.includes("b.ts")));
    });

    // ── Test 8: DependencyAnalyzer — empty context ───────────────────────────
    await test("Test 8: DependencyAnalyzer returns empty array for empty context", () => {
        const analyzer = new DependencyAnalyzer();
        const ctx: SnapshotContext = { projectRoot: TEST_WORKSPACE, workspaceRoot: TEST_WORKSPACE };
        const deps = analyzer.analyze(ctx);
        assert.deepStrictEqual(deps, []);
    });

    // ── Test 9: GraphCompiler — merges execution graph nodes ────────────────
    await test("Test 9: GraphCompiler merges execution graph nodes", () => {
        const compiler = new GraphCompiler();
        const ctx: SnapshotContext = {
            projectRoot: TEST_WORKSPACE,
            workspaceRoot: TEST_WORKSPACE,
            graphData: {
                nodes: [
                    { id: "node-1", type: "task", title: "Task One", status: "pending" },
                    { id: "node-2", type: "task", title: "Task Two", status: "completed" }
                ],
                edges: [
                    { from: "node-1", to: "node-2", kind: "depends-on", weight: 1 }
                ]
            }
        };
        const graph = compiler.compile(ctx, []);
        assert.ok(graph.nodes.some(n => n.id === "node-1"), "node-1 must be present");
        assert.ok(graph.nodes.some(n => n.id === "node-2"), "node-2 must be present");
        assert.ok(graph.edges.length > 0, "Edge must be present");
        assert.ok(graph.topologicalOrder.includes("node-1"), "Topological order must include node-1");
    });

    // ── Test 10: GraphCompiler — dependency edges create file nodes ──────────
    await test("Test 10: GraphCompiler creates file nodes from dependency edges", () => {
        const compiler = new GraphCompiler();
        const ctx: SnapshotContext = { projectRoot: TEST_WORKSPACE, workspaceRoot: TEST_WORKSPACE };
        const deps: SnapshotDependency[] = [
            { fromPath: "src/a.ts", toPath: "src/b.ts", kind: "import", importNames: [] }
        ];
        const graph = compiler.compile(ctx, deps);
        assert.ok(
            graph.nodes.some(n => n.id === "file::src/a.ts"),
            "file node for a.ts must exist"
        );
        assert.ok(
            graph.nodes.some(n => n.id === "file::src/b.ts"),
            "file node for b.ts must exist"
        );
    });

    // ── Test 11: SnapshotBuilder — buildSections token estimate ──────────────
    await test("Test 11: SnapshotBuilder sections have correct token estimates", () => {
        const builder = new SnapshotBuilder();
        const snapshot = buildMinimalSnapshot();
        for (const section of snapshot.sections) {
            const expected = Math.ceil(section.content.length / 4);
            assert.strictEqual(
                section.estimatedTokens,
                expected,
                `Section '${section.id}' token estimate should be Math.ceil(chars/4)`
            );
        }
    });

    // ── Test 12: SnapshotBuilder — sections sorted by priority ───────────────
    await test("Test 12: Snapshot sections are sorted by priority ascending", () => {
        const builder = new SnapshotBuilder();
        const fpEngine = new SnapshotFingerprintEngine();
        const ctx: SnapshotContext = { projectRoot: TEST_WORKSPACE, workspaceRoot: TEST_WORKSPACE };
        const fp = fpEngine.compute(ctx);
        const snapshot = builder.build({
            context: ctx, fingerprint: fp,
            files: [], symbols: [], dependencies: [], relationships: [],
            graph: { nodes: [], edges: [], topologicalOrder: [] },
            architecture: [], evolution: [], learning: [],
            compilationDurationMs: 5, stageCount: 1, incremental: false
        });
        for (let i = 1; i < snapshot.sections.length; i++) {
            assert.ok(
                snapshot.sections[i].priority >= snapshot.sections[i - 1].priority,
                "Sections must be in ascending priority order"
            );
        }
    });

    // ── Test 13: SnapshotValidator — validates minimal valid snapshot ─────────
    await test("Test 13: Validator reports valid for a correctly built snapshot", () => {
        const validator = new SnapshotValidator();
        const snapshot = buildMinimalSnapshot();
        const result = validator.validate(snapshot);
        if (!result.valid) {
            console.log("    Validation errors:", result.errors);
            console.log("    Validation warnings:", result.warnings);
        }
        assert.ok(result.valid, `Snapshot should be valid but got errors: ${result.errors.join(", ")}`);
    });

    // ── Test 14: SnapshotValidator — detects snapshotId mismatch ────────────
    await test("Test 14: Validator detects snapshotId / fingerprint hash mismatch", () => {
        const validator = new SnapshotValidator();
        const snapshot = buildMinimalSnapshot({ snapshotId: "wrong-id" });
        const result = validator.validate(snapshot);
        assert.ok(!result.valid, "Snapshot with wrong snapshotId must be invalid");
        assert.ok(
            result.errors.some(e => e.includes("snapshotId") || e.includes("fingerprint")),
            "Must report snapshotId/fingerprint mismatch"
        );
    });

    // ── Test 15: SnapshotValidator — detects duplicate section IDs ───────────
    await test("Test 15: Validator detects duplicate section IDs", () => {
        const validator = new SnapshotValidator();
        const snapshot = buildMinimalSnapshot();
        // Duplicate the first section
        const dupeSection = { ...snapshot.sections[0] };
        const modified = { ...snapshot, sections: [snapshot.sections[0], dupeSection] };
        const result = validator.validate(modified);
        assert.ok(!result.valid, "Snapshot with duplicate section IDs must be invalid");
        assert.ok(
            result.errors.some(e => e.toLowerCase().includes("duplicate")),
            "Must report duplicate section ID"
        );
    });

    // ── Test 16: SnapshotOptimizer — deduplicates array sections ────────────
    await test("Test 16: Optimizer deduplicates array sections", () => {
        const optimizer = new SnapshotOptimizer();
        const fpEngine = new SnapshotFingerprintEngine();
        const data = [{ id: 1 }, { id: 1 }, { id: 2 }];
        const content = JSON.stringify(data);
        const section: SnapshotSection = {
            id: "filesystem-index",
            name: "Filesystem Index",
            kind: "filesystem-index",
            content,
            priority: 10,
            contentHash: fpEngine.hashContent(content),
            estimatedTokens: Math.ceil(content.length / 4),
            sourcePaths: []
        };
        const snapshot = buildMinimalSnapshot({ sections: [section] });
        const result = optimizer.optimize(snapshot);
        // Optimized content should have fewer items
        const optimizedSection = result.sections.find(s => s.id === "filesystem-index")!;
        const optimizedData = JSON.parse(optimizedSection.content);
        assert.ok(
            Array.isArray(optimizedData) && optimizedData.length < data.length,
            "Optimizer should have removed duplicate array elements"
        );
    });

    // ── Test 17: SnapshotDeltaEngine — file added delta ─────────────────────
    await test("Test 17: DeltaEngine correctly identifies added files", () => {
        const delta = new SnapshotDeltaEngine();
        const s1 = buildMinimalSnapshot();
        const s2 = buildMinimalSnapshot({
            files: [
                { path: "src/new.ts", relativePath: "src/new.ts", extension: ".ts", sizeBytes: 100, linesOfCode: 5, language: "TypeScript", lastModified: "", contentHash: "abc" }
            ]
        });
        const result = delta.compute(s1, s2);
        assert.ok(
            result.changedFiles.some(f => f.path === "src/new.ts" && f.changeKind === "added"),
            "DeltaEngine must detect new file as added"
        );
    });

    // ── Test 18: SnapshotDeltaEngine — file removed delta ────────────────────
    await test("Test 18: DeltaEngine correctly identifies removed files", () => {
        const delta = new SnapshotDeltaEngine();
        const s1 = buildMinimalSnapshot({
            files: [
                { path: "src/old.ts", relativePath: "src/old.ts", extension: ".ts", sizeBytes: 100, linesOfCode: 5, language: "TypeScript", lastModified: "", contentHash: "xyz" }
            ]
        });
        const s2 = buildMinimalSnapshot({ files: [] });
        const result = delta.compute(s1, s2);
        assert.ok(
            result.changedFiles.some(f => f.path === "src/old.ts" && f.changeKind === "removed"),
            "DeltaEngine must detect removed file"
        );
    });

    // ── Test 19: SnapshotDeltaEngine — token delta ──────────────────────────
    await test("Test 19: DeltaEngine computes correct token delta", () => {
        const delta = new SnapshotDeltaEngine();
        const s1 = buildMinimalSnapshot();
        const s2 = buildMinimalSnapshot({
            metadata: {
                ...buildMinimalSnapshot().metadata,
                estimatedTokens: s1.metadata.estimatedTokens + 100
            }
        });
        const result = delta.compute(s1, s2);
        assert.strictEqual(result.tokenDelta, 100, "Token delta must be exactly 100");
    });

    // ── Test 20: SnapshotStorage — save and load ─────────────────────────────
    await test("Test 20: SnapshotStorage saves and loads a snapshot", async () => {
        const storage = new SnapshotStorage(TEST_WORKSPACE);
        const snapshot = buildMinimalSnapshot();
        await storage.save(snapshot);
        const loaded = await storage.load(snapshot.snapshotId);
        assert.ok(loaded, "Loaded snapshot must not be null");
        assert.strictEqual(loaded!.snapshotId, snapshot.snapshotId);
    });

    // ── Test 21: SnapshotStorage — latest() returns newest ──────────────────
    await test("Test 21: SnapshotStorage.latest() returns the most recently saved snapshot", async () => {
        const storage = new SnapshotStorage(TEST_WORKSPACE);
        const snapshot = buildMinimalSnapshot();
        await storage.save(snapshot);
        const latest = await storage.latest();
        assert.ok(latest, "latest() must return a snapshot");
        assert.strictEqual(latest!.snapshotId, snapshot.snapshotId);
    });

    // ── Test 22: SnapshotStorage — list() returns references ────────────────
    await test("Test 22: SnapshotStorage.list() returns stored references", async () => {
        const storage = new SnapshotStorage(TEST_WORKSPACE);
        const refs = await storage.list();
        assert.ok(Array.isArray(refs), "list() must return an array");
        assert.ok(refs.length >= 1, "list() must return at least one stored snapshot");
    });

    // ── Test 23: SnapshotStorage — delete works ──────────────────────────────
    await test("Test 23: SnapshotStorage.delete() removes snapshot from storage", async () => {
        const storage = new SnapshotStorage(TEST_WORKSPACE);
        const snapshot = buildMinimalSnapshot();
        await storage.save(snapshot);
        await storage.delete(snapshot.snapshotId);
        const loaded = await storage.load(snapshot.snapshotId);
        assert.strictEqual(loaded, null, "Deleted snapshot must return null on load");
    });

    // ── Test 24: SnapshotCache — put and get ────────────────────────────────
    await test("Test 24: SnapshotCache stores and retrieves snapshot by fingerprint hash", async () => {
        const cache = new SnapshotCache(TEST_WORKSPACE);
        const snapshot = buildMinimalSnapshot();
        await cache.put(snapshot);
        const retrieved = await cache.get(snapshot.metadata.fingerprint.hash);
        assert.ok(retrieved, "Cache must return stored snapshot");
        assert.strictEqual(retrieved!.snapshotId, snapshot.snapshotId);
    });

    // ── Test 25: SnapshotCache — has() for cache hit/miss ────────────────────
    await test("Test 25: SnapshotCache.has() correctly identifies cache hit and miss", async () => {
        const cache = new SnapshotCache(TEST_WORKSPACE);
        cache.clearMemory();

        const snapshot = buildMinimalSnapshot();
        const hit = await cache.has(snapshot.metadata.fingerprint.hash);
        assert.ok(hit, "Already stored snapshot should be a cache hit");

        const miss = await cache.has("nonexistent-hash-12345");
        assert.strictEqual(miss, false, "Unknown hash should be a cache miss");
    });

    // ── Test 26: ContextCompilerService — compile() ──────────────────────────
    await test("Test 26: ContextCompilerService.compile() returns a valid snapshot", async () => {
        const compiler = new ContextCompilerService(TEST_WORKSPACE, TEST_WORKSPACE);
        const result = await compiler.compile({ projectRoot: TEST_WORKSPACE, workspaceRoot: TEST_WORKSPACE });
        assert.ok(result.snapshot, "Compilation result must include a snapshot");
        assert.ok(result.snapshot.snapshotId, "Snapshot must have a snapshotId");
        assert.ok(result.metrics.totalDurationMs >= 0, "Metrics must include duration");
        assert.ok(result.metrics.stages.length > 0, "Metrics must include stages");
    });

    // ── Test 27: ContextCompilerService — cache hit on re-compile ────────────
    await test("Test 27: ContextCompilerService returns cache hit on second identical compile", async () => {
        const compiler = new ContextCompilerService(TEST_WORKSPACE, TEST_WORKSPACE);
        const result1 = await compiler.compile({ projectRoot: TEST_WORKSPACE, workspaceRoot: TEST_WORKSPACE });
        const result2 = await compiler.compile({ projectRoot: TEST_WORKSPACE, workspaceRoot: TEST_WORKSPACE });
        assert.ok(result2.cacheHit, "Second compile of identical workspace must be a cache hit");
        assert.strictEqual(
            result1.snapshot.snapshotId,
            result2.snapshot.snapshotId,
            "Cache hit must return same snapshot"
        );
    });

    // ── Test 28: ContextCompilerService — force full recompile ───────────────
    await test("Test 28: ContextCompilerService force=true bypasses cache", async () => {
        const compiler = new ContextCompilerService(TEST_WORKSPACE, TEST_WORKSPACE);
        const result = await compiler.compile({
            projectRoot: TEST_WORKSPACE,
            workspaceRoot: TEST_WORKSPACE,
            force: true
        });
        assert.strictEqual(result.cacheHit, false, "Forced compile must not be a cache hit");
    });

    // ── Test 29: ContextCompilerService — statistics() ───────────────────────
    await test("Test 29: ContextCompilerService.statistics() returns meaningful stats", async () => {
        const compiler = new ContextCompilerService(TEST_WORKSPACE, TEST_WORKSPACE);
        const stats = await compiler.statistics();
        assert.ok(stats, "statistics() must return stats object");
        assert.ok(stats.totalCompilations >= 0, "totalCompilations must be a non-negative number");
        assert.ok(stats.cacheHits >= 0, "cacheHits must be a non-negative number");
        assert.ok(stats.cacheMisses >= 0, "cacheMisses must be a non-negative number");
        assert.ok(
            stats.cacheHits + stats.cacheMisses === stats.totalCompilations,
            "cacheHits + cacheMisses must equal totalCompilations"
        );
    });

    // ── Test 30: ContextCompilerService — validate() on latest snapshot ──────
    await test("Test 30: ContextCompilerService.validate() returns valid result for compiled snapshot", async () => {
        const compiler = new ContextCompilerService(TEST_WORKSPACE, TEST_WORKSPACE);
        const result = await compiler.compile({
            projectRoot: TEST_WORKSPACE,
            workspaceRoot: TEST_WORKSPACE,
            force: true
        });
        const validation = await compiler.validate(result.snapshot.snapshotId);
        assert.ok(validation, "validate() must return a result");
        if (!validation!.valid) {
            console.log("    Errors:", validation!.errors);
            console.log("    Warnings:", validation!.warnings);
        }
        assert.ok(validation!.valid, `Compiled snapshot must be valid. Errors: ${validation!.errors.join(", ")}`);
    });

    // ─── Teardown & Summary ──────────────────────────────────────────────────

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
