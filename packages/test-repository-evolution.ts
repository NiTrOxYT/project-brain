import process from "process";
import path from "path";
import fs from "fs/promises";

import { RuntimeService } from "./runtime";
import { RepositoryEvolutionService } from "./repository-evolution";
import { KnowledgeFusionService } from "./knowledge-fusion";

async function main() {

    const workspaceRoot = path.join(process.cwd(), ".brain");
    const evolutionDir = path.join(workspaceRoot, "index", "evolution");
    const historyPath = path.join(evolutionDir, "history.json");
    const analyticsPath = path.join(evolutionDir, "analytics.json");

    console.log("Setting up workspace database...");
    const runtime = new RuntimeService({
        root: process.cwd()
    });
    await runtime.initialize();

    // 1. Initial Evolution Run
    console.log("\n1. Initializing Repository Evolution Service...");
    const evolution = new RepositoryEvolutionService(workspaceRoot);
    const { history, analytics } = await evolution.initialize();

    console.log(`  Commits parsed: ${history.commits.length}`);
    console.log(`  Files analyzed: ${analytics.fileHistory.length}`);
    console.log(`  Co-change relationships: ${analytics.coChangeRelationships.length}`);
    console.log(`  Repository HEAD Hash: ${history.repositoryHash}`);

    // Verify files created
    const historyExists = await fs.access(historyPath).then(() => true).catch(() => false);
    const analyticsExists = await fs.access(analyticsPath).then(() => true).catch(() => false);
    console.log(`  history.json exists: ${historyExists}`);
    console.log(`  analytics.json exists: ${analyticsExists}`);

    if (!historyExists || !analyticsExists) {
        console.error("FAIL: evolution files not generated on disk!");
        process.exit(1);
    }

    // 2. Verify Derived Metrics
    console.log("\n2. Verifying derived metrics on a sample file...");
    const sample = analytics.fileHistory.find(f => f.path.startsWith("packages/symbols"));
    if (sample) {
        console.log(`  File: ${sample.path}`);
        console.log(`    First appearance: ${sample.firstAppearance}`);
        console.log(`    Last modified: ${sample.lastModification}`);
        console.log(`    Commits: ${sample.commitCount}`);
        console.log(`    Churn score: ${sample.churnScore}`);
        console.log(`    Contributors count: ${sample.activeContributors}`);
        console.log(`    Primary Owner: ${sample.primaryOwner}`);
        console.log(`    Ownership Confidence: ${sample.ownershipConfidence.toFixed(4)}`);
        console.log(`    Stable Module: ${sample.stableModule}`);
        console.log(`    Recently Changed: ${sample.recentlyChanged}`);
    } else {
        console.warn("  No packages/symbols files found in Git history.");
    }

    // 3. Verify Reproducible Analytics
    console.log("\n3. Verifying analytics are reproducible from history.json...");
    const initialAnalytics = await fs.readFile(analyticsPath, "utf8");

    // Rebuild derived analytics
    const rebuiltAnalytics = await evolution.rebuildAnalytics();
    console.log("  Analytics rebuild completed.");

    // Parse and verify identical metadata (excluding generatedAt timestamp)
    const originalObj = JSON.parse(initialAnalytics);
    const rebuiltObj = rebuiltAnalytics;

    const isIdentical = 
        originalObj.repositoryHash === rebuiltObj.repositoryHash &&
        JSON.stringify(originalObj.fileHistory) === JSON.stringify(rebuiltObj.fileHistory) &&
        JSON.stringify(originalObj.coChangeRelationships) === JSON.stringify(rebuiltObj.coChangeRelationships);

    console.log(`  Are rebuilt analytics identical to initial run: ${isIdentical}`);
    if (!isIdentical) {
        console.error("FAIL: Rebuilt analytics differed from initial analytics!");
        process.exit(1);
    }

    // 4. Verify Incremental History Rebuild Skip
    console.log("\n4. Verifying incremental rebuild bypass when HEAD hash is unchanged...");
    const statBefore = await fs.stat(historyPath);
    
    // Trigger initialization again
    await evolution.initialize();
    
    const statAfter = await fs.stat(historyPath);
    const isSkipped = statBefore.mtimeMs === statAfter.mtimeMs;
    console.log(`  Skip rebuild of history.json (Expected: true): ${isSkipped}`);
    if (!isSkipped) {
        console.error("FAIL: history.json was rebuilt even though HEAD was unchanged!");
        process.exit(1);
    }

    // 5. Verify Knowledge Fusion integration
    console.log("\n5. Verifying Knowledge Fusion consumes evolution signal...");
    const fuser = new KnowledgeFusionService(workspaceRoot);
    const fusionResult = await fuser.fuse({
        query: "implement relationship analyzer service",
        options: {
            includeExecution: true,
            includeRelationships: true,
            includeGraph: true,
            includeArchitectureMemory: true
        }
    });

    const candWithEvolution = fusionResult.candidates.filter(c => c.signals.evolution > 0);
    console.log(`  Fuser candidates containing evolution signal: ${candWithEvolution.length}`);
    if (candWithEvolution.length > 0) {
        const sampleCand = candWithEvolution[0];
        console.log(`  Sample: ${sampleCand.id} (${sampleCand.type})`);
        console.log(`    Evolution score: ${sampleCand.signals.evolution.toFixed(4)}`);
        console.log(`    Score: ${sampleCand.score.toFixed(4)} | Confidence: ${sampleCand.confidence.toFixed(4)}`);
        console.log(`    Provenance: [${sampleCand.provenance.join(", ")}]`);
        console.log(`    Reasons: ${JSON.stringify(sampleCand.reasons)}`);
    } else {
        console.error("FAIL: No candidates contain evolution signals!");
        process.exit(1);
    }

    console.log("\nAll evolution tests passed successfully!");

}

main().catch(error => {
    console.error("Test failed:", error);
    process.exit(1);
});
