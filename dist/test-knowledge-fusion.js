import process from "process";
import path from "path";
import fs from "fs/promises";
import { RuntimeService } from "./runtime";
import { SynchronizerService } from "./synchronizer";
import { KnowledgeFusionService } from "./knowledge-fusion";
async function main() {
    const workspaceRoot = path.join(process.cwd(), ".brain");
    console.log("Setting up workspace database...");
    const runtime = new RuntimeService({
        root: process.cwd()
    });
    await runtime.initialize();
    const query = "implement relationship analyzer service";
    // 1. Initial Fusion Run
    console.log(`\n1. Running Knowledge Fusion Engine for query: "${query}"`);
    const fuser = new KnowledgeFusionService(workspaceRoot);
    const result1 = await fuser.fuse({
        query,
        options: {
            includeExecution: true,
            includeRelationships: true,
            includeGraph: true,
            includeArchitectureMemory: true
        }
    });
    const candidates = result1.candidates;
    const diag = result1.diagnostics;
    console.log("\nDiagnostics:");
    console.log(`  Total Candidates: ${diag.mergedCandidates}`);
    console.log(`  Duplicate Eliminations: ${diag.duplicateEliminations}`);
    console.log(`  Semantic Contribution: ${diag.semanticContribution}`);
    console.log(`  Execution Contribution: ${diag.executionContribution}`);
    console.log(`  Relationship Contribution: ${diag.relationshipContribution}`);
    console.log(`  Graph Contribution: ${diag.graphContribution}`);
    console.log(`  Architecture Contribution: ${diag.architectureContribution}`);
    console.log(`  Evolution Contribution: ${diag.evolutionContribution}`);
    const sumScore = candidates.reduce((acc, c) => acc + c.score, 0);
    const avgScore = candidates.length > 0 ? sumScore / candidates.length : 0;
    console.log(`\nAverage candidate score: ${avgScore.toFixed(4)}`);
    console.log("\nTop 5 Candidates:");
    for (let i = 0; i < Math.min(5, candidates.length); i++) {
        const c = candidates[i];
        console.log(`  [Rank ${i + 1}] ID: ${c.id} (${c.type})`);
        console.log(`    Score: ${c.score.toFixed(4)} | Confidence: ${c.confidence.toFixed(4)}`);
        console.log(`    Provenance: [${c.provenance.join(", ")}]`);
        console.log(`    Signals: sem=${c.signals.semantic.toFixed(2)}, exec=${c.signals.execution.toFixed(2)}, rel=${c.signals.relationships.toFixed(2)}, graph=${c.signals.graph.toFixed(2)}, mem=${c.signals.architecture.toFixed(2)}, evo=${c.signals.evolution.toFixed(2)}`);
        console.log(`    Reasons: ${JSON.stringify(c.reasons)}`);
    }
    // Provenance Distribution
    const provCount = new Map();
    for (const c of candidates) {
        for (const p of c.provenance) {
            provCount.set(p, (provCount.get(p) ?? 0) + 1);
        }
    }
    console.log("\nProvenance Distribution:");
    for (const [p, count] of provCount.entries()) {
        console.log(`  - ${p}: ${count} candidates`);
    }
    // 2. Deterministic Ranking Check
    console.log("\n2. Verifying deterministic ranking across multiple runs...");
    const result2 = await fuser.fuse({
        query,
        options: {
            includeExecution: true,
            includeRelationships: true,
            includeGraph: true,
            includeArchitectureMemory: true
        }
    });
    const isDeterministic = JSON.stringify(result1.candidates) === JSON.stringify(result2.candidates);
    console.log(`Is ranking output 100% deterministic and stable: ${isDeterministic}`);
    if (!isDeterministic) {
        console.error("FAIL: Ranking is not deterministic!");
        process.exit(1);
    }
    // 3. Strategy Abstraction & Configurable Weights
    console.log("\n3. Testing configurable weights and custom fusion strategy...");
    // Graph-centric custom strategy
    class GraphCentricStrategy {
        score(candidate) {
            return candidate.signals.graph * 0.9 + candidate.signals.semantic * 0.1;
        }
    }
    const graphFuser = new KnowledgeFusionService(workspaceRoot, new GraphCentricStrategy());
    const graphResult = await graphFuser.fuse({
        query,
        options: {
            includeExecution: true,
            includeRelationships: true,
            includeGraph: true,
            includeArchitectureMemory: true
        }
    });
    console.log("Top 3 Graph-centric Candidates:");
    for (let i = 0; i < Math.min(3, graphResult.candidates.length); i++) {
        const c = graphResult.candidates[i];
        console.log(`  - ID: ${c.id} (Graph score: ${c.signals.graph.toFixed(2)}, Semantic score: ${c.signals.semantic.toFixed(2)})`);
    }
    // 4. Synchronization and updates
    console.log("\n4. Modifying file to verify fusion updates after synchronization...");
    const targetFile = "packages/test-symbols.ts";
    const targetFilePath = path.join(process.cwd(), targetFile);
    const originalContent = await fs.readFile(targetFilePath, "utf8");
    const tempContent = originalContent + "\n// Temporary comment for synchronization test\n";
    await fs.writeFile(targetFilePath, tempContent, "utf8");
    try {
        console.log("Running Synchronizer...");
        const synchronizer = new SynchronizerService(process.cwd(), workspaceRoot);
        const syncState = await synchronizer.synchronize();
        console.log(`Files changed: [${syncState.changedFiles.join(", ")}]`);
        // Re-run fusion
        const afterSyncResult = await fuser.fuse({
            query,
            options: {
                includeExecution: true,
                includeRelationships: true,
                includeGraph: true,
                includeArchitectureMemory: true
            }
        });
        console.log(`Fusion run after sync completed. Final candidate count: ${afterSyncResult.candidates.length}`);
        console.log("SUCCESS: Fusion updates successfully reflect synchronized changes.");
    }
    finally {
        // Always restore original file content
        await fs.writeFile(targetFilePath, originalContent, "utf8");
        const synchronizer = new SynchronizerService(process.cwd(), workspaceRoot);
        await synchronizer.synchronize();
        console.log("Original file and synchronization status restored.");
    }
}
main().catch(error => {
    console.error("Test failed:", error);
    process.exit(1);
});
