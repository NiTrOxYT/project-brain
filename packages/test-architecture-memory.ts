import process from "process";
import path from "path";
import fs from "fs/promises";

import { RuntimeService } from "./runtime/index.js";
import { ArchitectureMemoryService } from "./architecture-memory/index.js";
import { QueryEngineService } from "./query-engine/index.js";

async function main() {

    const workspaceRoot = path.join(process.cwd(), ".brain");
    const memoryPath = path.join(workspaceRoot, "memory", "architecture.json");
    const metadataPath = path.join(workspaceRoot, "memory", "metadata.json");

    console.log("Setting up workspace database...");
    const runtime = new RuntimeService({
        root: process.cwd()
    });
    await runtime.initialize();

    // Clean existing memory/metadata for a fresh test run
    await fs.rm(memoryPath, { force: true });
    await fs.rm(metadataPath, { force: true });

    let service = new ArchitectureMemoryService(workspaceRoot);

    console.log("\n1. Creating memory entries with default provenance...");
    const entry1 = await service.create({
        title: "Symbols Extractor Convention",
        category: "convention",
        description: "All symbols should use SymbolsService.extract. Do not use regex.",
        tags: ["convention", "symbols", "AST"],
        relatedFiles: ["packages/symbols/service.ts"],
        relatedSymbols: ["SymbolsService"]
    });

    console.log(`Entry 1 ID: ${entry1.id}`);
    console.log(`Entry 1 Source (expected: user): ${entry1.source}`);
    console.log(`Entry 1 Confidence (expected: 1): ${entry1.confidence}`);

    console.log("\n2. Creating entry with custom provenance...");
    const entry2 = await service.create({
        title: "Execution Graph Invariant",
        category: "invariant",
        description: "Symbol nodes must contain full qualified names.",
        tags: ["invariant", "execution-graph", "AST"],
        relatedFiles: ["packages/execution-graph/service.ts"],
        relatedSymbols: ["ExecutionGraphService"],
        source: "adr",
        confidence: 1.0
    });

    console.log(`Entry 2 ID: ${entry2.id}`);
    console.log(`Entry 2 Source (expected: adr): ${entry2.source}`);
    console.log(`Entry 2 Confidence (expected: 1): ${entry2.confidence}`);

    const currentList = await service.list();
    console.log(`Total entries: ${currentList.length}`);

    // Verify metadata file exists
    const metadataExistsInitial = await fs.access(metadataPath).then(() => true).catch(() => false);
    console.log(`Metadata file exists: ${metadataExistsInitial}`);
    if (metadataExistsInitial) {
        const rawMeta = await fs.readFile(metadataPath, "utf8");
        console.log(`Metadata Content: ${rawMeta.trim()}`);
    }

    // 3. Update entry
    console.log(`\n3. Updating Entry 2...`);
    const updated2 = await service.update(entry2.id, {
        description: "Symbol nodes must contain full qualified names and kinds."
    });
    console.log(`Updated Entry 2 ID (should not change): ${updated2.id}`);
    console.log(`Updated Entry 2 Description: "${updated2.description}"`);
    console.log(`Entry 2 CreatedAt: ${updated2.createdAt}`);
    console.log(`Entry 2 UpdatedAt: ${updated2.updatedAt}`);

    // 4. Search entries
    console.log(`\n4. Searching entries for "symbols convention"...`);
    const searchResults = await service.search("symbols convention");
    console.log(`Search results found: ${searchResults.length}`);
    for (const res of searchResults) {
        console.log(`  - Match: "${res.title}" (ID: ${res.id}, category: ${res.category})`);
    }

    // 5. Retrieve by ID
    console.log(`\n5. Retrieving entry 1 by ID...`);
    const retrieved1 = await service.get(entry1.id);
    console.log(`Retrieved title: "${retrieved1?.title}"`);

    // 6. Delete one entry and check ID non-reuse
    console.log("\n6. Deleting dummy entry to verify IDs are never reused...");
    const dummy = await service.create({
        title: "Dummy to delete",
        category: "note",
        description: "Temporary note",
        tags: ["dummy"],
        relatedFiles: [],
        relatedSymbols: []
    });
    console.log(`Dummy created with ID: ${dummy.id}`);
    await service.delete(dummy.id);
    console.log(`Dummy deleted.`);

    console.log("\n7. Simulating service restart (re-instantiating service)...");
    service = new ArchitectureMemoryService(workspaceRoot);
    const restartedList = await service.list();
    console.log(`Total entries loaded after restart: ${restartedList.length}`);
    console.log(`Persistence status: ${restartedList.length === 2 ? "SUCCESS" : "FAIL"}`);

    const newAfterRestart = await service.create({
        title: "Post-restart Entry",
        category: "note",
        description: "Verify next ID increments past deleted ID",
        tags: ["restart"],
        relatedFiles: [],
        relatedSymbols: []
    });
    console.log(`New Entry ID post-restart: ${newAfterRestart.id}`);
    console.log(`Is ID format sequential (expected ARCH-000004 or greater): ${newAfterRestart.id.startsWith("ARCH-")}`);

    // 8. Test Automatic Migration
    console.log("\n8. Verifying automatic migration of legacy JSON database...");
    // Clear everything first
    await fs.rm(memoryPath, { force: true });
    await fs.rm(metadataPath, { force: true });

    // Write a legacy layout
    const legacyData = {
        generatedAt: new Date().toISOString(),
        version: 2,
        entries: [
            {
                id: "uuid-1111-2222-3333",
                title: "Legacy ADR entry",
                category: "adr",
                description: "This is a legacy ADR",
                tags: ["legacy"],
                relatedFiles: [],
                relatedSymbols: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                id: "ARCH-000002",
                title: "Legacy ARCH entry",
                category: "decision",
                description: "This is a legacy ARCH entry",
                tags: ["legacy"],
                relatedFiles: [],
                relatedSymbols: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        ]
    };
    await fs.writeFile(memoryPath, JSON.stringify(legacyData, null, 2), "utf8");

    // Re-instantiate to trigger migration
    service = new ArchitectureMemoryService(workspaceRoot);
    const migratedList = await service.list();
    console.log(`Migrated entries count: ${migratedList.length}`);
    
    const entryUUID = migratedList.find(e => e.title === "Legacy ADR entry");
    const entryARCH = migratedList.find(e => e.title === "Legacy ARCH entry");

    console.log(`Migrated UUID Entry ID: ${entryUUID?.id}`);
    console.log(`Migrated UUID Entry source: ${entryUUID?.source}`);
    console.log(`Migrated UUID Entry confidence: ${entryUUID?.confidence}`);

    console.log(`Migrated ARCH Entry ID: ${entryARCH?.id}`);
    console.log(`Migrated ARCH Entry source: ${entryARCH?.source}`);
    console.log(`Migrated ARCH Entry confidence: ${entryARCH?.confidence}`);

    const metadataExistsAfterMigration = await fs.access(metadataPath).then(() => true).catch(() => false);
    console.log(`Metadata file created after migration: ${metadataExistsAfterMigration}`);
    if (metadataExistsAfterMigration) {
        const rawMeta = await fs.readFile(metadataPath, "utf8");
        const metaObj = JSON.parse(rawMeta);
        console.log(`Metadata nextArchitectureId: ${metaObj.nextArchitectureId}`);
    }

    // 9. Query Engine integration
    console.log("\n9. Verifying Query Engine integration...");
    const queryEngine = new QueryEngineService(process.cwd(), workspaceRoot);
    const queryResult = await queryEngine.query({
        query: "how does legacy adr entry work?",
        includeArchitectureMemory: true,
        useCache: false
    });

    const memoryInContext = queryResult.context.architectureMemory;
    console.log(`Architecture Memory present in QueryResult: ${!!memoryInContext}`);
    if (memoryInContext) {
        console.log(`Total relevant entries merged: ${memoryInContext.length}`);
        for (const entry of memoryInContext) {
            console.log(`  - Merged: "${entry.title}" (ID: ${entry.id})`);
        }
    }

}

main().catch(error => {
    console.error("Test failed:", error);
    process.exit(1);
});
