// ──────────────────────────────────────────────────────────────────────────────
// BUILD-070B — Regression Test — End-to-End Context Retrieval Pipeline
// Reproduces the exact failures that caused brain.get_context to return empty.
//
// Tests:
//   1. Compile produces architecture entries > 0 (not just stubs)
//   2. Provider returns populated architectureSummary
//   3. Provider returns populated semanticMemory
//   4. Provider returns populated rankedFiles or snippets
//   5. Provider confidence > 0
//   6. Provider estimatedTokens > 0
//   7. get-architecture never returns empty string
//   8. latestSnapshot not poisoned by static cache across instances
// ──────────────────────────────────────────────────────────────────────────────
import path from "path";
import { fileURLToPath } from "url";
import { ContextCompilerService } from "./context-compiler/service.js";
import { ContextProvider } from "./context-provider/provider.js";
import { ContextSynchronizationService } from "./context-sync/service.js";
import { GetContextTool } from "./mcp-server/tools/get-context.js";
import { GetArchitectureTool } from "./mcp-server/tools/get-architecture.js";
import { SearchMemoryTool } from "./mcp-server/tools/search-memory.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(__dirname, ".."); // project-brain root
let passed = 0;
let failed = 0;
function assert(condition, msg) {
    if (condition) {
        console.log(`  [PASS] ${msg}`);
        passed++;
    }
    else {
        console.error(`  [FAIL] ${msg}`);
        failed++;
    }
}
async function main() {
    console.log("\n═══════════════════════════════════════════════════════════════");
    console.log("  BUILD-070B — Context Retrieval E2E Regression Tests");
    console.log("═══════════════════════════════════════════════════════════════\n");
    // ── Test 1: Compile produces architecture entries ────────────────────────
    console.log("Phase 1: Compiler pipeline");
    const compiler = new ContextCompilerService(WORKSPACE, WORKSPACE);
    const result = await compiler.compile({ projectRoot: WORKSPACE, workspaceRoot: WORKSPACE, force: true });
    const snap = result.snapshot;
    assert(snap.files.length > 0, `Files compiled: ${snap.files.length}`);
    assert(snap.symbols.length > 0, `Symbols compiled: ${snap.symbols.length}`);
    assert(snap.dependencies.length > 0, `Dependencies compiled: ${snap.dependencies.length}`);
    assert(snap.relationships.length > 0, `Relationships compiled: ${snap.relationships.length}`);
    assert(snap.architecture.length > 0, `Architecture entries > 0: ${snap.architecture.length} entries`);
    assert(!snap.architecture.every(e => e.title === "Legacy ADR entry"), "Architecture contains non-stub entries");
    const archCategories = snap.architecture.map(e => e.category);
    assert(archCategories.includes("Language") || archCategories.includes("Structure") || archCategories.includes("Overview"), `Architecture has structural categories: [${archCategories.join(", ")}]`);
    // ── Test 2: Static cache not shared across instances ─────────────────────
    console.log("\nPhase 2: Per-instance snapshot cache isolation");
    const svc1 = new ContextSynchronizationService(WORKSPACE, WORKSPACE);
    const svc2 = new ContextSynchronizationService(WORKSPACE, WORKSPACE);
    const snap1 = await svc1.latestSnapshot();
    const snap2 = await svc2.latestSnapshot();
    assert(snap1 !== null, "Instance 1: latestSnapshot not null");
    assert(snap2 !== null, "Instance 2: latestSnapshot not null");
    // Both should return same snapshot id but be independent instances
    assert(snap1?.snapshotId === snap2?.snapshotId, "Both instances return same snapshotId");
    // ── Test 3: ContextProvider — populated response ──────────────────────────
    console.log("\nPhase 3: ContextProvider response fields");
    const provider = new ContextProvider(WORKSPACE, WORKSPACE);
    const ctx = await provider.getContext({
        providerId: "test",
        query: "architecture overview",
        workspaceRoot: WORKSPACE,
        snapshotId: "latest",
        maxTokens: 8000,
        openFiles: [],
        recentlyEditedFiles: []
    });
    assert(typeof ctx.architectureSummary === "string" && ctx.architectureSummary.length > 20, `architectureSummary non-empty: "${ctx.architectureSummary.slice(0, 80)}..."`);
    assert(ctx.confidence > 0, `confidence > 0: ${ctx.confidence}`);
    assert(ctx.estimatedTokens > 0, `estimatedTokens > 0: ${ctx.estimatedTokens}`);
    assert(ctx.semanticMemory.length > 0, `semanticMemory.length > 0: ${ctx.semanticMemory.length}`);
    assert(ctx.rankedFiles.length > 0 || ctx.snippets.length > 0, `rankedFiles (${ctx.rankedFiles.length}) or snippets (${ctx.snippets.length}) > 0`);
    // ── Test 4: MCP tool GetContextTool ──────────────────────────────────────
    console.log("\nPhase 4: MCP tool invocations");
    const getCtxTool = new GetContextTool();
    assert(!getCtxTool.inputSchema.required.includes("snapshotId"), "get_context: snapshotId not required");
    const ctxRaw = await getCtxTool.execute({
        query: "context compiler pipeline",
        workspaceRoot: WORKSPACE
        // snapshotId intentionally omitted — tests auto-default to "latest"
    });
    const ctxResult = JSON.parse(ctxRaw.content[1].text);
    assert(ctxResult && typeof ctxResult.architectureSummary === "string", "get_context: returns architectureSummary");
    assert(ctxResult.confidence > 0, `get_context: confidence=${ctxResult.confidence}`);
    // ── Test 5: MCP tool GetArchitectureTool ────────────────────────────────
    const getArchTool = new GetArchitectureTool();
    const archRaw = await getArchTool.execute({ workspaceRoot: WORKSPACE });
    const archResult = JSON.parse(archRaw.content[1].text);
    assert(typeof archResult.architectureSummary === "string" && archResult.architectureSummary.length > 10, `get_architecture: non-empty summary: "${archResult.architectureSummary.slice(0, 60)}..."`);
    assert(archResult.entries.length > 0, `get_architecture: entries > 0: ${archResult.entries.length}`);
    // ── Test 6: CLI search_memory command ───────────────────────────────────
    console.log("\nPhase 6: CLI search_memory diagnostics");
    const { runSearchMemory } = await import("./cli/commands/search-memory.js");
    // Test 6.1: Active search
    let loggedLines = [];
    const mockLogger = {
        log: (msg) => { loggedLines.push(msg); },
        error: (msg) => { console.error(msg); },
        blank: () => { }
    };
    // Temporarily swap loggers
    const { logger: originalLogger } = await import("./cli/utils/logger.js");
    const originalLog = originalLogger.log;
    originalLogger.log = mockLogger.log;
    try {
        await runSearchMemory({ workspace: WORKSPACE, project: WORKSPACE, json: false, verbose: false, quiet: false }, { query: "authentication", debug: true });
    }
    finally {
        originalLogger.log = originalLog;
    }
    assert(loggedLines.some(l => l.includes("Loaded snapshot:")), "CLI search_memory: printed Loaded snapshot");
    assert(loggedLines.some(l => l.includes("Memory entries:")), "CLI search_memory: printed Memory entries");
    assert(loggedLines.some(l => l.includes("Returned entries:")), "CLI search_memory: printed Returned entries");
    // Test 6.2: Stale / unrelated check
    const toolSearch = new SearchMemoryTool();
    const searchRaw = await toolSearch.execute({
        query: "xyz_random_query_that_should_not_match",
        workspaceRoot: WORKSPACE
    });
    const searchRes = JSON.parse(searchRaw.content[1].text);
    assert(searchRes.memories.length === 0, "CLI/MCP search_memory: unrelated query returns zero entries (no fallback mock)");
    // ── Summary ──────────────────────────────────────────────────────────────
    console.log("\n═══════════════════════════════════════════════════════════════");
    console.log(`  RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
    console.log("═══════════════════════════════════════════════════════════════\n");
    if (failed > 0)
        process.exit(1);
}
main().catch(err => { console.error(err); process.exit(1); });
