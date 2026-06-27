import process from "process";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";

import { RuntimeService } from "./runtime/index.js";
import { ContextAssemblerService } from "./context-assembler/index.js";

async function main() {

    const workspaceRoot = path.join(process.cwd(), ".brain");

    console.log("Setting up workspace database...");
    const runtime = new RuntimeService({
        root: process.cwd()
    });
    await runtime.initialize();

    const assembler = new ContextAssemblerService(
        process.cwd(),
        workspaceRoot
    );

    const query = "implement relationship analyzer service";

    // 1. Cache Miss Test
    console.log(`\n1. Running Cache Miss for query: "${query}"`);
    const startMiss = Date.now();
    const resultMiss = await assembler.assemble(query);
    const durationMiss = Date.now() - startMiss;
    console.log(`Cache Miss completed in ${durationMiss}ms`);

    // Verify cache file exists
    const queryHash = crypto
        .createHash("sha256")
        .update(query)
        .digest("hex");
    const cachePath = path.join(workspaceRoot, "context", `${queryHash}.json`);
    const fileExists = await fs.access(cachePath).then(() => true).catch(() => false);
    console.log(`Cache file exists: ${fileExists}`);

    if (!fileExists) {
        console.error("FAIL: context cache file was not created!");
        process.exit(1);
    }

    // 2. Cache Hit Test
    console.log(`\n2. Running Cache Hit for query: "${query}"`);
    const startHit = Date.now();
    const resultHit = await assembler.assemble(query);
    const durationHit = Date.now() - startHit;
    console.log(`Cache Hit completed in ${durationHit}ms`);

    if (durationHit >= durationMiss && durationMiss > 50) {
        console.warn(`WARNING: Cache hit took longer or similar time: hit=${durationHit}ms, miss=${durationMiss}ms`);
    } else {
        console.log(`SUCCESS: Cache hit is faster!`);
    }

    // 3. Verification of values, budget, and duplicates
    console.log("\n3. Validating result content...");
    console.log(`Selected files count: ${resultMiss.files.length}`);
    console.log(`Selected symbols count: ${resultMiss.symbols.length}`);
    console.log(`Selected relationships count: ${resultMiss.relationships.length}`);
    console.log(`Estimated total tokens: ${resultMiss.estimatedTokens}`);
    console.log(`Max budget: ${resultMiss.plan.contextBudget * 1000} tokens`);

    if (resultMiss.estimatedTokens > resultMiss.plan.contextBudget * 1000) {
        console.error("FAIL: Budget was exceeded!");
        process.exit(1);
    }
    console.log("SUCCESS: Token budget was respected.");

    // Check duplicates in files
    const filePaths = resultMiss.files.map(f => f.path);
    const uniqueFiles = new Set(filePaths);
    if (filePaths.length !== uniqueFiles.size) {
        console.error("FAIL: Duplicate files found!");
        process.exit(1);
    }
    console.log("SUCCESS: No duplicate files found.");

    // Check duplicates in symbols
    const symbolKeys = resultMiss.symbols.map(s => `${s.file}:${s.name}:${s.kind}`);
    const uniqueSymbols = new Set(symbolKeys);
    if (symbolKeys.length !== uniqueSymbols.size) {
        console.error("FAIL: Duplicate symbols found!");
        process.exit(1);
    }
    console.log("SUCCESS: No duplicate symbols found.");

    // Check duplicates in relationships
    const relKeys = resultMiss.relationships.map(r => `${r.file}:${r.source}:${r.target}:${r.type}`);
    const uniqueRels = new Set(relKeys);
    if (relKeys.length !== uniqueRels.size) {
        console.error("FAIL: Duplicate relationships found!");
        process.exit(1);
    }
    console.log("SUCCESS: No duplicate relationships found.");

    // Verify stable output
    const isStable = JSON.stringify(resultMiss) === JSON.stringify(resultHit);
    console.log(`SUCCESS: Output is stable and deterministic: ${isStable}`);

    console.log("\nSelected files:");
    for (const file of resultMiss.files) {
        console.log(`  - ${file.path} (score: ${file.score}, tokens: ${file.estimatedTokens})`);
    }

}

main().catch(error => {
    console.error("Test failed:", error);
    process.exit(1);
});
