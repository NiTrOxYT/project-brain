import process from "process";
import path from "path";
import fs from "fs/promises";

import { RuntimeService } from "./runtime/index.js";
import { QueryEngineService } from "./query-engine/index.js";

async function main() {

    const workspaceRoot = path.join(process.cwd(), ".brain");

    console.log("Setting up workspace database...");
    const runtime = new RuntimeService({
        root: process.cwd()
    });
    await runtime.initialize();

    const engine = new QueryEngineService(
        process.cwd(),
        workspaceRoot
    );

    const queryStr = "how does symbols service extract files";

    // 1. First execution (cache miss)
    console.log(`\n1. Running Query (Cache Miss): "${queryStr}"`);
    const res1 = await engine.query({
        query: queryStr,
        useCache: true,
        includeExecution: true,
        includeRelationships: true,
        includeGraph: true
    });

    printStats(res1);

    if (res1.diagnostics.cacheHit) {
        console.error("FAIL: Expected cache hit to be false on first run!");
        process.exit(1);
    }
    console.log("SUCCESS: Initial query processed with cache miss.");

    // 2. Second execution (cache hit)
    console.log(`\n2. Running Same Query (Cache Hit): "${queryStr}"`);
    const res2 = await engine.query({
        query: queryStr,
        useCache: true,
        includeExecution: true,
        includeRelationships: true,
        includeGraph: true
    });

    printStats(res2);

    if (!res2.diagnostics.cacheHit) {
        console.error("FAIL: Expected cache hit to be true on second run!");
        process.exit(1);
    }
    console.log("SUCCESS: Second query retrieved from cache.");

    // 3. Modify a file
    const targetFile = "packages/test-symbols.ts";
    const targetPath = path.join(process.cwd(), targetFile);

    console.log(`\n3. Modifying ${targetFile}...`);
    const originalContent = await fs.readFile(targetPath, "utf8");
    const modifiedContent = originalContent + "\n// query engine test dummy\n";
    await fs.writeFile(targetPath, modifiedContent, "utf8");

    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log("Running Query again (expect Sync + Cache Invalidation)...");
    const res3 = await engine.query({
        query: queryStr,
        useCache: true,
        includeExecution: true,
        includeRelationships: true,
        includeGraph: true
    });

    printStats(res3);

    // Restore file immediately
    await fs.writeFile(targetPath, originalContent, "utf8");

    if (res3.diagnostics.cacheHit) {
        console.error("FAIL: Expected cache hit to be false after file modification!");
        process.exit(1);
    }
    if (!res3.diagnostics.synchronized) {
        console.error("FAIL: Expected synchronization to be true after file modification!");
        process.exit(1);
    }
    console.log("SUCCESS: Synchronization triggered and cache invalidated successfully.");

    // 4. Verification clean state
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log("\n4. Running query again after restoring file (re-sync)...");
    const res4 = await engine.query({
        query: queryStr,
        useCache: true
    });
    console.log(`Sync status: ${res4.diagnostics.synchronized}, Cache hit: ${res4.diagnostics.cacheHit}`);

    console.log("Running once more to verify cache hit works again...");
    const res5 = await engine.query({
        query: queryStr,
        useCache: true
    });
    console.log(`Cache hit: ${res5.diagnostics.cacheHit}`);

    if (!res5.diagnostics.cacheHit) {
        console.error("FAIL: Expected cache hit to be true again after re-indexing!");
        process.exit(1);
    }
    console.log("SUCCESS: Returned to clean cached state.");

    console.log("\nAll query engine tests passed successfully!");

}

function printStats(result: any) {
    const diag = result.diagnostics;
    console.log("------------------------------------------");
    console.log(`Total query time: ${diag.totalTimeMs}ms`);
    console.log(`Planning time: ${diag.planningTimeMs}ms`);
    console.log(`Retrieval time: ${diag.retrievalTimeMs}ms`);
    console.log(`Assembly time: ${diag.assemblyTimeMs}ms`);
    console.log(`Cache hit: ${diag.cacheHit}`);
    console.log(`Synchronized: ${diag.synchronized}`);
    console.log(`Files selected: ${diag.selectedFiles}`);
    console.log(`Symbols selected: ${diag.selectedSymbols}`);
    console.log(`Relationships selected: ${diag.selectedRelationships}`);
    if (diag.error) {
        console.log(`Diagnostics Error: ${diag.error}`);
    }
    console.log("------------------------------------------");
}

main().catch(error => {
    console.error("Test failed:", error);
    process.exit(1);
});
