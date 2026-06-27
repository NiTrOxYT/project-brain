import process from "process";
import path from "path";
import fs from "fs/promises";

import { RuntimeService } from "./runtime/index.js";
import { EngineeringPlannerService } from "./engineering-planner/index.js";
import { QueryEngineService } from "./query-engine/index.js";
import { KnowledgeFusionService } from "./knowledge-fusion/index.js";
import { ContextAssemblerService } from "./context-assembler/index.js";

async function main() {
    const workspaceRoot = path.join(process.cwd(), ".brain");

    console.log("Setting up workspace database...");
    const runtime = new RuntimeService({
        root: process.cwd()
    });
    await runtime.initialize();

    const planner = new EngineeringPlannerService(process.cwd(), workspaceRoot);
    const fuser = new KnowledgeFusionService(workspaceRoot);

    // Helper to get fused candidates
    const getCandidates = async (query: string) => {
        const res = await fuser.fuse({
            query,
            options: {
                includeExecution: true,
                includeRelationships: true,
                includeGraph: true,
                includeArchitectureMemory: true
            }
        });
        return res.candidates;
    };

    // 1. Feature Request Planning
    console.log("\n1. Generating plan for Feature request...");
    const featQuery = "implement a new execution graph exporter service";
    const featCandidates = await getCandidates(featQuery);
    const featPlan = await planner.plan({
        query: featQuery,
        intent: "feature",
        candidates: featCandidates
    });

    console.log(`  Goal: ${featPlan.goal}`);
    console.log(`  Complexity Label: ${featPlan.complexity.label} (Score: ${featPlan.complexity.score})`);
    console.log(`  Overall Risk: ${featPlan.risk.overall}`);
    console.log(`  Phases generated: ${featPlan.phases.length}`);
    console.log(`  Tasks generated: ${featPlan.tasks.length}`);
    console.log(`  Affected Files: [${featPlan.affectedFiles.join(", ")}]`);

    // Verify task IDs format and properties
    if (featPlan.tasks.length > 0) {
        const sampleTask = featPlan.tasks[0];
        console.log(`  Sample Task: ${sampleTask.id}`);
        console.log(`    Title: ${sampleTask.title}`);
        console.log(`    Phase: ${sampleTask.phaseId}`);
        console.log(`    Rationale: [${sampleTask.rationale.join("; ")}]`);
        if (!sampleTask.id.startsWith("TASK-")) {
            console.error("FAIL: Task ID does not start with 'TASK-'!");
            process.exit(1);
        }
    }

    // 2. Determinism Verification
    console.log("\n2. Verifying plan determinism across runs...");
    const featPlan2 = await planner.plan({
        query: featQuery,
        intent: "feature",
        candidates: featCandidates
    });

    featPlan.diagnostics.planningTimeMs = 0;
    featPlan2.diagnostics.planningTimeMs = 0;

    const isIdentical = JSON.stringify(featPlan) === JSON.stringify(featPlan2);
    console.log(`  Is plan output 100% identical and stable: ${isIdentical}`);
    if (!isIdentical) {
        console.error("FAIL: Plans are not identical!");
        process.exit(1);
    }

    // 3. Rollback Task Verification
    console.log("\n3. Verifying automated rollback task generation...");
    const modifyTasks = featPlan.tasks.filter(t => t.type === "modify" || t.type === "create" || t.type === "refactor");
    const rollbackTasks = featPlan.tasks.filter(t => t.isRollback === true);

    console.log(`  Modifying tasks: ${modifyTasks.length}`);
    console.log(`  Rollback tasks: ${rollbackTasks.length}`);

    if (modifyTasks.length > 0) {
        const modifyTask = modifyTasks[0];
        console.log(`  Modify Task: ${modifyTask.id} (${modifyTask.title})`);
        console.log(`    Rollback ID: ${modifyTask.rollbackTaskId}`);
        
        const rollbackTask = rollbackTasks.find(r => r.id === modifyTask.rollbackTaskId);
        if (!rollbackTask) {
            console.error(`FAIL: No rollback task found for modifying task ${modifyTask.id}!`);
            process.exit(1);
        }
        console.log(`    Rollback Task Details: ${rollbackTask.id} (${rollbackTask.title})`);
        if (rollbackTask.rollbackForTaskId !== modifyTask.id) {
            console.error("FAIL: Rollback task rollbackForTaskId mismatch!");
            process.exit(1);
        }
    }

    // 4. Verification of Bug-fix, Refactor, and Doc intents
    console.log("\n4. Verifying Bug-fix, Refactor, and Doc intent plans...");
    
    // Bug-fix
    const bugPlan = await planner.plan({
        query: "fix concurrency crash in context cache store",
        intent: "bugfix",
        candidates: await getCandidates("fix concurrency crash in context cache store")
    });
    console.log(`  Bugfix plan complexity: ${bugPlan.complexity.label}, overall risk: ${bugPlan.risk.overall}`);

    // Refactor
    const refactorPlan = await planner.plan({
        query: "refactor synchronizer pipeline and simplify AST traversal",
        intent: "refactor",
        candidates: await getCandidates("refactor synchronizer pipeline")
    });
    console.log(`  Refactor plan complexity: ${refactorPlan.complexity.label}, overall risk: ${refactorPlan.risk.overall}`);

    // Documentation
    const docPlan = await planner.plan({
        query: "document public parameters for relationship analyzer",
        intent: "documentation",
        candidates: await getCandidates("document relationship analyzer")
    });
    console.log(`  Documentation plan complexity: ${docPlan.complexity.label}, overall risk: ${docPlan.risk.overall}`);

    // 5. Rich Risk and Complexity Metrics Verification
    console.log("\n5. Verifying structured risk and numeric complexity...");
    console.log("  Risk Metrics:");
    console.log(`    API risk: ${featPlan.risk.api}`);
    console.log(`    Execution risk: ${featPlan.risk.execution}`);
    console.log(`    History risk: ${featPlan.risk.history}`);
    console.log(`    Architecture risk: ${featPlan.risk.architecture}`);
    console.log(`    Ownership risk: ${featPlan.risk.ownership}`);
    console.log(`    Overall risk rating: ${featPlan.risk.overall}`);

    console.log("  Complexity Metrics:");
    console.log(`    Score: ${featPlan.complexity.score}`);
    console.log(`    Label: ${featPlan.complexity.label}`);

    // 6. Missing Information and Estimates Verification
    console.log("\n6. Verifying missing information detection and estimates...");
    
    const dbCandidates = await getCandidates("connect database pool");
    console.log("  Candidates found:", dbCandidates.map(c => c.id));

    // Trigger missing info for database
    const dbPlan = await planner.plan({
        query: "connect to postgresql database using a dynamic connection pool",
        intent: "feature",
        candidates: dbCandidates
    });
    console.log(`  Missing information found: [${dbPlan.missingInformation.join("; ")}]`);
    if (dbPlan.missingInformation.length === 0) {
        console.error("FAIL: Expected database missing information flag!");
        process.exit(1);
    }

    console.log("  Engineering Estimates:");
    console.log(`    Estimated duration (hours): ${featPlan.estimatedDuration}`);
    console.log(`    Estimated LOC: ${featPlan.estimatedLOC}`);
    console.log(`    Estimated Tokens: ${featPlan.estimatedTokens}`);

    // 7. Query Engine and Context Assembler Integration
    console.log("\n7. Verifying Query Engine integration...");
    const engine = new QueryEngineService(process.cwd(), workspaceRoot);
    
    const engineResult = await engine.query({
        query: "implement query planner feature",
        includeExecution: true,
        includeRelationships: true,
        includeGraph: true,
        useCache: false // force calculation
    });

    console.log(`  Query intent detected: ${engineResult.context.plan.intent}`);
    console.log(`  Has engineeringPlan embedded: ${!!engineResult.context.engineeringPlan}`);
    
    if (engineResult.context.plan.intent === "analysis") {
        console.error("FAIL: Intent should have been an engineering type!");
        process.exit(1);
    }

    if (!engineResult.context.engineeringPlan) {
        console.error("FAIL: No engineering plan embedded in context package!");
        process.exit(1);
    }

    console.log(`  Embedded Plan Goal: ${engineResult.context.engineeringPlan.goal}`);
    console.log(`  Embedded Plan Tasks: ${engineResult.context.engineeringPlan.tasks.length}`);

    // 8. Informational Query bypass verification
    console.log("\n8. Verifying informational queries bypass planning...");
    const infoResult = await engine.query({
        query: "explain relationship analyzer service",
        includeExecution: true,
        includeRelationships: true,
        useCache: false
    });

    console.log(`  Query intent detected: ${infoResult.context.plan.intent}`);
    console.log(`  Has engineeringPlan embedded (Expected: false): ${!!infoResult.context.engineeringPlan}`);
    if (infoResult.context.engineeringPlan) {
        console.error("FAIL: Informational query should have bypassed planning!");
        process.exit(1);
    }

    console.log("\nAll engineering planner tests passed successfully!");
}

main().catch(error => {
    console.error("Test execution failed:", error);
    process.exit(1);
});
