// ──────────────────────────────────────────────────────────────────────────────
// BUILD-071 — MCP Server — Tool Result Compatibility Tests
// Verifies every tool returns valid CallToolResult structure
// ──────────────────────────────────────────────────────────────────────────────

import { GetContextTool } from "./mcp-server/tools/get-context.js";
import { GetArchitectureTool } from "./mcp-server/tools/get-architecture.js";
import { SearchMemoryTool } from "./mcp-server/tools/search-memory.js";
import { ExplainFileTool } from "./mcp-server/tools/explain-file.js";
import { FindSymbolTool } from "./mcp-server/tools/find-symbol.js";
import { FindDependenciesTool } from "./mcp-server/tools/find-dependencies.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
    if (condition) {
        console.log(`  [PASS] ${msg}`);
        passed++;
    } else {
        console.error(`  [FAIL] ${msg}`);
        failed++;
    }
}

function verifyToolResult(res: any, name: string): void {
    assert(res !== null && typeof res === "object", `${name}: result is an object`);
    if (!res) return;

    assert(Array.isArray(res.content), `${name}: content is an array`);
    if (Array.isArray(res.content)) {
        assert(res.content.length > 0, `${name}: content is not empty`);
        for (let i = 0; i < res.content.length; i++) {
            const block = res.content[i];
            assert(block.type === "text", `${name}: content[${i}].type is "text"`);
            assert(typeof block.text === "string", `${name}: content[${i}].text is string`);
            
            // If it is mixedResult, block[1].text should be parseable JSON
            if (i === 1) {
                try {
                    const parsedJson = JSON.parse(block.text);
                    assert(typeof parsedJson === "object", `${name}: content[${i}].text is parseable JSON object`);
                } catch (e: any) {
                    assert(false, `${name}: content[${i}].text failed JSON parse: ${e.message}`);
                }
            }
        }
    }

    assert(res.isError === undefined || typeof res.isError === "boolean", `${name}: isError is optional boolean`);
    // Ensure it doesn't return raw domain fields at top level
    assert(res.architectureSummary === undefined, `${name}: does not leak architectureSummary at top level`);
    assert(res.rankedFiles === undefined, `${name}: does not leak rankedFiles at top level`);
    assert(res.semanticMemory === undefined, `${name}: does not leak semanticMemory at top level`);
    assert(res.snippets === undefined, `${name}: does not leak snippets at top level`);
}

async function runTests() {
    console.log("\n═══════════════════════════════════════════════════════════════");
    console.log("  BUILD-071 — MCP Tool Result Compatibility Tests");
    console.log("═══════════════════════════════════════════════════════════════\n");

    // 1. brain.get_context
    console.log("Testing brain.get_context...");
    const getContext = new GetContextTool();
    const ctxRes = await getContext.execute({
        query: "explain project architecture",
        workspaceRoot: WORKSPACE
    });
    verifyToolResult(ctxRes, "brain.get_context");

    // 2. brain.get_architecture
    console.log("\nTesting brain.get_architecture...");
    const getArch = new GetArchitectureTool();
    const archRes = await getArch.execute({
        workspaceRoot: WORKSPACE
    });
    verifyToolResult(archRes, "brain.get_architecture");

    // 3. brain.search_memory
    console.log("\nTesting brain.search_memory...");
    const searchMem = new SearchMemoryTool();
    const searchRes = await searchMem.execute({
        query: "authentication",
        workspaceRoot: WORKSPACE
    });
    verifyToolResult(searchRes, "brain.search_memory");

    // 4. brain.explain_file
    console.log("\nTesting brain.explain_file...");
    const explainFile = new ExplainFileTool();
    const expRes = await explainFile.execute({
        path: "packages/mcp-server/server.ts",
        workspaceRoot: WORKSPACE
    });
    verifyToolResult(expRes, "brain.explain_file");

    // 5. brain.find_symbol
    console.log("\nTesting brain.find_symbol...");
    const findSym = new FindSymbolTool();
    const symRes = await findSym.execute({
        name: "ProviderIntegration",
        workspaceRoot: WORKSPACE
    });
    verifyToolResult(symRes, "brain.find_symbol");

    // 6. brain.find_dependencies
    console.log("\nTesting brain.find_dependencies...");
    const findDeps = new FindDependenciesTool();
    const depsRes = await findDeps.execute({
        file: "packages/mcp-server/server.ts",
        workspaceRoot: WORKSPACE
    });
    verifyToolResult(depsRes, "brain.find_dependencies");

    // 7. Error handling check
    console.log("\nTesting tool execution failure behavior...");
    const badRes = await getContext.execute({
        // missing required fields to trigger failure
    });
    verifyToolResult(badRes, "brain.get_context (error case)");
    assert(badRes.isError === true, "isError is true in errorResult");

    console.log("\n═══════════════════════════════════════════════════════════════");
    console.log(`  COMPATIBILITY RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
    console.log("═══════════════════════════════════════════════════════════════\n");

    if (failed > 0) process.exit(1);
}

runTests().catch(err => {
    console.error("Test execution failed:", err);
    process.exit(1);
});
