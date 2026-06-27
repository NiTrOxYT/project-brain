import process from "process";
import path from "path";
import fs from "fs/promises";
import { RelationshipAnalyzerService } from "./relationship-analyzer/index.js";
import { RuntimeService } from "./runtime/index.js";

async function main() {

    const workspaceRoot = path.join(process.cwd(), ".brain");

    console.log("Setting up workspace database...");
    const runtime = new RuntimeService({
        root: process.cwd()
    });
    await runtime.initialize();

    console.log("Initializing Relationship Analyzer...");
    const analyzer = new RelationshipAnalyzerService(
        process.cwd(),
        workspaceRoot
    );

    console.log("Analyzing relationships...");
    const result = await analyzer.analyze();

    const relationshipsPath = path.join(
        workspaceRoot,
        "index",
        "relationships.json"
    );

    const exists = await fs.access(relationshipsPath).then(() => true).catch(() => false);
    console.log(`relationships.json exists: ${exists}`);

    if (!exists) {
        console.error("FAIL: relationships.json not found!");
        process.exit(1);
    }

    console.log("\n--- Relationship Analyzer Summary Statistics ---");
    console.log(`Total relationships found: ${result.relationships.length}`);

    const counts: Record<string, number> = {
        contains: 0,
        imports: 0,
        exports: 0,
        extends: 0,
        implements: 0,
        calls: 0,
        references: 0,
        constructs: 0
    };

    for (const rel of result.relationships) {
        counts[rel.type] = (counts[rel.type] || 0) + 1;
    }

    console.log("Relationship counts by type:");
    for (const [type, count] of Object.entries(counts)) {
        console.log(`  - ${type}: ${count}`);
    }

    console.log("------------------------------------------------");

}

main().catch(error => {
    console.error("Test failed:", error);
    process.exit(1);
});
