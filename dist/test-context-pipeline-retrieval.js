// ──────────────────────────────────────────────────────────────────────────────
// E2E Context Pipeline Retrieval Regression Test
// ──────────────────────────────────────────────────────────────────────────────
import assert from "assert";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_WORKSPACE = path.join(__dirname, "..", ".brain-test-e2e-pipeline");
import { runInit } from "./cli/commands/init.js";
import { runCompile } from "./cli/commands/compile.js";
import { runInspect } from "./cli/commands/inspect.js";
import { GetContextTool } from "./mcp-server/tools/get-context.js";
import { GetArchitectureTool } from "./mcp-server/tools/get-architecture.js";
import { SearchMemoryTool } from "./mcp-server/tools/search-memory.js";
let passed = 0;
let failed = 0;
async function test(name, fn) {
    try {
        const res = fn();
        if (res && typeof res.then === "function") {
            await res;
        }
        console.log(`  [PASS] ${name}`);
        passed++;
    }
    catch (err) {
        console.error(`  [FAIL] ${name}: ${err.stack || err}`);
        failed++;
    }
}
async function runAll() {
    console.log("Starting E2E Context Retrieval Pipeline Regression Tests...");
    // Cleanup and setup
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
    await fs.mkdir(TEST_WORKSPACE, { recursive: true });
    // Create a mock source directory with both TS and JS files
    const srcDir = path.join(TEST_WORKSPACE, "src");
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, "math.ts"), `export class MathService {
            add(a: number, b: number): number {
                return a + b;
            }
        }`, "utf8");
    await fs.writeFile(path.join(srcDir, "logger.js"), `export function logMessage(msg) {
            console.log(msg);
        }`, "utf8");
    // Create a mock architecture memory entry
    const memDir = path.join(TEST_WORKSPACE, "memory");
    await fs.mkdir(memDir, { recursive: true });
    await fs.writeFile(path.join(memDir, "architecture.json"), JSON.stringify({
        entries: [
            {
                category: "Core",
                title: "E2E Architecture Layout",
                description: "Math service handles calculations, Logger handles logs.",
                tags: ["math", "logger"]
            }
        ]
    }, null, 2), "utf8");
    const opts = {
        workspace: TEST_WORKSPACE,
        project: TEST_WORKSPACE,
        json: false,
        verbose: false,
        quiet: false
    };
    // 1. Test brain init
    await test("brain init", async () => {
        await runInit(opts);
        const brainJson = path.join(TEST_WORKSPACE, ".brain", "brain.json");
        const exists = await fs.access(brainJson).then(() => true).catch(() => false);
        assert.ok(exists, ".brain/brain.json should exist");
    });
    // 2. Test brain compile
    await test("brain compile", async () => {
        await runCompile(opts, { force: true });
    });
    // 3. Test brain inspect
    await test("brain inspect", async () => {
        let logged = "";
        const originalLog = console.log;
        console.log = (...args) => {
            logged += args.join(" ") + "\n";
        };
        try {
            await runInspect(opts);
        }
        finally {
            console.log = originalLog;
        }
        try {
            assert.ok(logged.includes("Latest Snapshot ID:"), "Should output Snapshot ID");
            assert.ok(logged.includes("File Count:          3"), "Should detect 3 files");
            assert.ok(logged.includes("Symbol Count:        3"), "Should detect 3 symbols (MathService, add, logMessage)");
            assert.ok(logged.includes("Architecture Exists: Yes"), "Should detect architecture");
        }
        catch (err) {
            console.error("Inspect logged output was:\n", logged);
            throw err;
        }
    });
    // 4. Test MCP brain.get_context
    await test("MCP brain.get_context", async () => {
        const tool = new GetContextTool();
        const res = await tool.execute({
            query: "MathService add",
            workspaceRoot: TEST_WORKSPACE,
            snapshotId: "latest",
            maxTokens: 4000
        });
        assert.ok(res.snippets && res.snippets.length > 0, "Should retrieve non-empty snippets");
        const containsMath = res.snippets.some((s) => s.code.includes("MathService"));
        assert.ok(containsMath, "Snippets should contain MathService code");
    });
    // 5. Test MCP brain.get_architecture
    await test("MCP brain.get_architecture", async () => {
        const tool = new GetArchitectureTool();
        const res = await tool.execute({
            workspaceRoot: TEST_WORKSPACE
        });
        assert.ok(res.architectureSummary, "Should return architecture summary");
        assert.ok(res.architectureSummary.includes("E2E Architecture Layout"), "Summary should include dynamic entry");
        assert.ok(res.entries && res.entries.length > 0, "Should return entries array");
    });
    // 6. Test MCP brain.search_memory
    await test("MCP brain.search_memory", async () => {
        const tool = new SearchMemoryTool();
        const res = await tool.execute({
            query: "Logger logMessage",
            workspaceRoot: TEST_WORKSPACE
        });
        assert.ok(res.memories && res.memories.length > 0, "Should retrieve matched memories");
        const matchedSemantic = res.memories.some((m) => m.type === "semantic" && m.content.includes("logger.js"));
        assert.ok(matchedSemantic, "Should find semantic memory for logger.js file");
    });
    // Clean up
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
    console.log(`\nE2E Verification Summary: ${passed} Passed, ${failed} Failed`);
    process.exit(failed > 0 ? 1 : 0);
}
runAll().catch(err => {
    console.error("Unhandle rejection:", err);
    process.exit(1);
});
