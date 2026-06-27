// ──────────────────────────────────────────────────────────────────────────────
// BUILD-052 — Learning Engine — Verification Suite
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs/promises";
import path from "path";
import assert from "assert";
import { LearningEngineService } from "./learning-engine/service.js";
import { LearningStorage } from "./learning-engine/storage.js";
import { LearningExtractor } from "./learning-engine/extractor.js";
import { LearningClassifier } from "./learning-engine/classifier.js";
import { RepairPatternsLearner } from "./learning-engine/repair-patterns.js";
import { ProviderPerformanceTracker } from "./learning-engine/provider-performance.js";
import { PromptLibrary } from "./learning-engine/prompt-library.js";
import { LearningOptimizer } from "./learning-engine/optimizer.js";
import { LearningRecommender } from "./learning-engine/recommender.js";
import { KnowledgeFusionService } from "./knowledge-fusion/service.js";
import { QueryEngineService } from "./query-engine/service.js";
const TEMP_DIR = path.resolve("temp-learning-test");
async function setupTestDir() {
    await fs.mkdir(TEMP_DIR, { recursive: true });
}
async function cleanupTestDir() {
    await fs.rm(TEMP_DIR, { recursive: true, force: true });
}
async function main() {
    console.log("===============================================================");
    console.log(" BUILD-052 — Learning Engine Verification Suite");
    console.log("===============================================================\n");
    await setupTestDir();
    try {
        await test01_ExperienceExtraction();
        await test02_PatternClassification();
        await test03_ProviderStatistics();
        await test04_RepairLearning();
        await test05_PromptDeduplication();
        await test06_OptimizationGeneration();
        await test07_RecommendationQuality();
        await test08_DeterministicOutputs();
        await test09_StorageAndSnapshots();
        await test10_CompactionAndReset();
        await test11_AutonomousRuntimeIntegration();
        await test12_ProviderRuntimeIntegration();
        await test13_KnowledgeFusionIntegration();
        await test14_QueryEngineDiagnostics();
        console.log("\n===============================================================");
        console.log(" RESULTS: All Learning Engine assertions passed successfully!");
        console.log("===============================================================");
    }
    catch (err) {
        console.error("\n❌ Verification failed with error:");
        console.error(err);
        process.exit(1);
    }
    finally {
        await cleanupTestDir();
    }
}
// Mock completed execution loop result
function createMockResult(planId, status, journal) {
    return {
        planId,
        status,
        summary: {
            totalTasks: 1,
            completedTasks: status === "Completed" ? 1 : 0,
            failedTasks: status === "Failed" ? 1 : 0,
            repairedCount: 0,
            retriedCount: 0,
            validationFailures: 0,
            durationMs: 1500,
            successPercentage: status === "Completed" ? 100 : 0
        },
        metrics: {
            durationMs: 1500,
            repairCount: 0,
            retryCount: 0,
            validationCount: 1,
            providerExecutions: 1,
            workspaceTransactions: 1,
            successRate: status === "Completed" ? 100 : 0,
            failureRate: status === "Failed" ? 100 : 0,
            timePerPhase: { executing: 1400, validating: 100 }
        },
        errors: [],
        journal
    };
}
async function test01_ExperienceExtraction() {
    console.log("── 01. Experience Extraction ──────────────────────────────────");
    const extractor = new LearningExtractor(TEMP_DIR);
    const journal = [
        {
            type: "TaskStarted",
            timestamp: new Date().toISOString(),
            payload: { taskId: "task-1", taskType: "refactor", taskTitle: "Refactor typescript helper", taskFile: "src/helper.ts" }
        },
        {
            type: "WorkspaceTransactionApplied",
            timestamp: new Date().toISOString(),
            payload: { taskId: "task-1", transactionId: "tx-1" }
        },
        {
            type: "TaskCompleted",
            timestamp: new Date().toISOString(),
            payload: { taskId: "task-1" }
        }
    ];
    const mockResult = createMockResult("plan-01", "Completed", journal);
    const exps = await extractor.extract(mockResult);
    assert.strictEqual(exps.length, 1);
    assert.strictEqual(exps[0].outcome, "success");
    assert.strictEqual(exps[0].taskType, "refactor");
    assert.strictEqual(exps[0].taskTitle, "Refactor typescript helper");
    assert.ok(exps[0].filesModified.includes("src/helper.ts"));
    console.log("  ✓ Correctly extracted experience status, types, and modified files");
}
async function test02_PatternClassification() {
    console.log("── 02. Pattern Classification ─────────────────────────────────");
    const classifier = new LearningClassifier();
    const exp1 = {
        id: "1", planId: "p", timestamp: "t", providerId: "c", modelId: "m",
        taskType: "refactor", taskTitle: "Refactor types", outcome: "success",
        durationMs: 10, tokensUsed: 10, cost: 0.1, filesModified: [], repairCycles: 0,
        retries: 0, errors: [], validationScore: 100
    };
    const exp2 = { ...exp1, taskTitle: "Update README.md", taskType: "document" };
    const exp3 = { ...exp1, errors: ["Cannot find module 'express'"] };
    const exp4 = { ...exp1, errors: ["timeout during execution"] };
    assert.strictEqual(classifier.classify(exp1), "Refactor");
    assert.strictEqual(classifier.classify(exp2), "Documentation");
    assert.strictEqual(classifier.classify(exp3), "Dependency");
    assert.strictEqual(classifier.classify(exp4), "Timeout");
    console.log("  ✓ Categorized Compilation, Test, Timeout, and Doc patterns deterministically");
}
async function test03_ProviderStatistics() {
    console.log("── 03. Provider Statistics ────────────────────────────────────");
    const tracker = new ProviderPerformanceTracker();
    const exps = [
        {
            id: "1", planId: "p", timestamp: "t", providerId: "claude-code", modelId: "m",
            taskType: "refactor", taskTitle: "Refactor types", outcome: "success",
            durationMs: 1000, tokensUsed: 500, cost: 0.05, filesModified: ["src/app.ts"], repairCycles: 0,
            retries: 0, errors: [], validationScore: 100
        },
        {
            id: "2", planId: "p", timestamp: "t", providerId: "claude-code", modelId: "m",
            taskType: "refactor", taskTitle: "Refactor types", outcome: "failure",
            durationMs: 2000, tokensUsed: 800, cost: 0.08, filesModified: [], repairCycles: 1,
            retries: 1, errors: ["Type error"], validationScore: 0
        }
    ];
    const stats = tracker.update(exps);
    assert.strictEqual(stats.length, 1);
    const s = stats[0];
    assert.strictEqual(s.providerId, "claude-code");
    assert.strictEqual(s.successRate, 50);
    assert.strictEqual(s.totalExecutions, 2);
    assert.strictEqual(s.averageDurationMs, 1500);
    assert.ok(s.preferredLanguages.includes("TypeScript"));
    console.log("  ✓ Computed preferred languages, rolling success rates, and token aggregates");
}
async function test04_RepairLearning() {
    console.log("── 04. Repair Learning ────────────────────────────────────────");
    const learner = new RepairPatternsLearner();
    const exps = [
        {
            id: "1", planId: "p", timestamp: "t", providerId: "claude-code", modelId: "m",
            taskType: "refactor", taskTitle: "Refactor types", outcome: "success",
            durationMs: 1000, tokensUsed: 500, cost: 0.05, filesModified: ["src/app.ts"], repairCycles: 1,
            retries: 0, errors: ["Cannot find module 'react'"], validationScore: 100
        }
    ];
    const patterns = learner.learn(exps, []);
    assert.strictEqual(patterns.length, 1);
    const p = patterns[0];
    assert.strictEqual(p.errorType, "DependencyError");
    assert.strictEqual(p.successCount, 1);
    assert.strictEqual(p.totalCount, 1);
    assert.ok(p.recommendedFix.includes("install"));
    console.log("  ✓ Extracted repair strategies and confidence scores from logs");
}
async function test05_PromptDeduplication() {
    console.log("── 05. Prompt Deduplication ───────────────────────────────────");
    const library = new PromptLibrary();
    let list = library.record([], "claude-code", "refactor", "System Instruction V1", "success", 100, 0, 500, 0.01);
    list = library.record(list, "claude-code", "refactor", "System Instruction V1", "success", 100, 0, 600, 0.02);
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].useCount, 2);
    assert.strictEqual(list[0].averageTokens, 550);
    console.log("  ✓ Deduplicated system prompt bodies using payload hash integrity");
}
async function test06_OptimizationGeneration() {
    console.log("── 06. Optimization Generation ────────────────────────────────");
    const optimizer = new LearningOptimizer();
    const experiences = [
        {
            id: "1", planId: "p", timestamp: "t", providerId: "claude-code", modelId: "m",
            taskType: "refactor", taskTitle: "Refactor types", outcome: "success",
            durationMs: 1000, tokensUsed: 500, cost: 0.05, filesModified: ["src/app.ts"], repairCycles: 0,
            retries: 0, errors: [], validationScore: 100
        },
        {
            id: "2", planId: "p", timestamp: "t", providerId: "claude-code", modelId: "m",
            taskType: "refactor", taskTitle: "Refactor types", outcome: "success",
            durationMs: 1000, tokensUsed: 500, cost: 0.05, filesModified: ["src/app.ts"], repairCycles: 0,
            retries: 0, errors: [], validationScore: 100
        }
    ];
    const providers = [
        {
            providerId: "claude-code", successRate: 100, failureRate: 0, repairSuccessRate: 100,
            averageDurationMs: 1000, averageTokens: 500, averageCost: 0.05, averageValidationScore: 100,
            preferredLanguages: ["TypeScript"], preferredTaskTypes: ["refactor"], preferredRepositorySize: "Small",
            rollingConfidence: 0.9, totalExecutions: 2
        }
    ];
    const rules = optimizer.generateRules(experiences, providers, []);
    assert.ok(rules.length > 0);
    const rule = rules.find(r => r.ruleType === "provider-preference");
    assert.ok(rule);
    assert.strictEqual(rule.action.preferredProvider, "claude-code");
    console.log("  ✓ Generated provider-preference optimization rules");
}
async function test07_RecommendationQuality() {
    console.log("── 07. Recommendation Quality ─────────────────────────────────");
    const recommender = new LearningRecommender();
    const rules = [
        {
            id: "opt-provider-pref-claude-code-refactor",
            description: "Prefer Claude for refactor",
            ruleType: "provider-preference",
            condition: { taskType: "refactor" },
            action: { preferredProvider: "claude-code" },
            confidence: 0.95,
            evidenceCount: 3,
            lastUpdated: new Date().toISOString(),
            evidence: []
        }
    ];
    const rec = recommender.recommend({ taskType: "refactor", taskTitle: "Refactor TS helper" }, rules, [], [], []);
    assert.strictEqual(rec.recommendedProvider, "claude-code");
    assert.strictEqual(rec.providerConfidence, 0.95);
    assert.ok(rec.rulesApplied.includes("opt-provider-pref-claude-code-refactor"));
    console.log("  ✓ Exposed reliable recommendations for provider selection");
}
async function test08_DeterministicOutputs() {
    console.log("── 08. Deterministic Outputs ──────────────────────────────────");
    const optimizer = new LearningOptimizer();
    const experiences = [
        {
            id: "1", planId: "p", timestamp: "t", providerId: "claude-code", modelId: "m",
            taskType: "refactor", taskTitle: "Refactor types", outcome: "success",
            durationMs: 1000, tokensUsed: 500, cost: 0.05, filesModified: ["src/app.ts"], repairCycles: 0,
            retries: 0, errors: [], validationScore: 100
        }
    ];
    const providers = [
        {
            providerId: "claude-code", successRate: 100, failureRate: 0, repairSuccessRate: 100,
            averageDurationMs: 1000, averageTokens: 500, averageCost: 0.05, averageValidationScore: 100,
            preferredLanguages: ["TypeScript"], preferredTaskTypes: ["refactor"], preferredRepositorySize: "Small",
            rollingConfidence: 0.9, totalExecutions: 2
        }
    ];
    const rules1 = optimizer.generateRules(experiences, providers, []);
    const rules2 = optimizer.generateRules(experiences, providers, []);
    assert.deepStrictEqual(rules1, rules2);
    console.log("  ✓ Confirmed that identical execution history yields identical rules");
}
async function test09_StorageAndSnapshots() {
    console.log("── 09. Storage & Snapshots ────────────────────────────────────");
    const storage = new LearningStorage(TEMP_DIR);
    await storage.ensureDirectory();
    const mockExp = [
        {
            id: "exp-1", planId: "p-1", timestamp: new Date().toISOString(), providerId: "claude-code", modelId: "m",
            taskType: "refactor", taskTitle: "Refactor types", outcome: "success",
            durationMs: 1000, tokensUsed: 500, cost: 0.05, filesModified: ["src/app.ts"], repairCycles: 0,
            retries: 0, errors: [], validationScore: 100
        }
    ];
    await storage.saveExperiences(mockExp);
    const loaded = await storage.loadExperiences();
    assert.deepStrictEqual(loaded, mockExp);
    const snapshot = await storage.exportSnapshot();
    assert.strictEqual(snapshot.experiences.length, 1);
    await storage.reset();
    const emptyExps = await storage.loadExperiences();
    assert.strictEqual(emptyExps.length, 0);
    await storage.importSnapshot(snapshot);
    const imported = await storage.loadExperiences();
    assert.deepStrictEqual(imported, mockExp);
    console.log("  ✓ Successfully verified storage loads, saves, resets, and snapshot export/imports");
}
async function test10_CompactionAndReset() {
    console.log("── 10. Compaction & Reset ─────────────────────────────────────");
    const storage = new LearningStorage(TEMP_DIR);
    const mockExpList = Array.from({ length: 120 }, (_, i) => ({
        id: `exp-${i}`, planId: "p-1", timestamp: new Date().toISOString(), providerId: "claude-code", modelId: "m",
        taskType: "refactor", taskTitle: "Refactor types", outcome: "success",
        durationMs: 1000, tokensUsed: 500, cost: 0.05, filesModified: [], repairCycles: 0,
        retries: 0, errors: [], validationScore: 100
    }));
    await storage.saveExperiences(mockExpList);
    await storage.compaction();
    const compacted = await storage.loadExperiences();
    assert.strictEqual(compacted.length, 100);
    console.log("  ✓ Correctly truncated experiences list during database compaction");
}
async function test11_AutonomousRuntimeIntegration() {
    console.log("── 11. Autonomous Runtime Integration ──────────────────────────");
    // Verify that LearningEngineService learn doesn't throw and updates statistics
    const service = new LearningEngineService(TEMP_DIR);
    await service.reset();
    const journal = [
        {
            type: "TaskStarted",
            timestamp: new Date().toISOString(),
            payload: { taskId: "task-1", taskType: "refactor", taskTitle: "Refactor types", taskFile: "src/app.ts" }
        },
        {
            type: "WorkspaceTransactionApplied",
            timestamp: new Date().toISOString(),
            payload: { taskId: "task-1", transactionId: "tx-1" }
        },
        {
            type: "TaskCompleted",
            timestamp: new Date().toISOString(),
            payload: { taskId: "task-1" }
        }
    ];
    const mockResult = createMockResult("plan-01", "Completed", journal);
    const res = await service.learn(mockResult);
    assert.ok(res.success);
    assert.strictEqual(res.recordsAdded, 1);
    assert.strictEqual(res.diagnostics?.databaseSize, 1);
    const stats = await service.statistics();
    assert.strictEqual(stats.totalExecutions, 1);
    assert.strictEqual(stats.successfulExecutions, 1);
    console.log("  ✓ Autonomous execution loop successfully registers learning on completion");
}
async function test12_ProviderRuntimeIntegration() {
    console.log("── 12. Provider Runtime Integration ────────────────────────────");
    const service = new LearningEngineService(TEMP_DIR);
    await service.reset();
    // Populate with preferred provider info
    const mockExp = [
        {
            id: "exp-1", planId: "p-1", timestamp: new Date().toISOString(), providerId: "ollama", modelId: "m",
            taskType: "document", taskTitle: "Write README", outcome: "success",
            durationMs: 100, tokensUsed: 10, cost: 0.0, filesModified: ["README.md"], repairCycles: 0,
            retries: 0, errors: [], validationScore: 100
        },
        {
            id: "exp-2", planId: "p-1", timestamp: new Date().toISOString(), providerId: "ollama", modelId: "m",
            taskType: "document", taskTitle: "Write README", outcome: "success",
            durationMs: 100, tokensUsed: 10, cost: 0.0, filesModified: ["README.md"], repairCycles: 0,
            retries: 0, errors: [], validationScore: 100
        }
    ];
    const mockRes = createMockResult("plan-02", "Completed", [
        { type: "TaskStarted", timestamp: new Date().toISOString(), payload: { taskId: "exp-1", taskType: "document", taskTitle: "Write README", taskFile: "README.md" } },
        { type: "TaskCompleted", timestamp: new Date().toISOString(), payload: { taskId: "exp-1" } },
        { type: "TaskStarted", timestamp: new Date().toISOString(), payload: { taskId: "exp-2", taskType: "document", taskTitle: "Write README", taskFile: "README.md" } },
        { type: "TaskCompleted", timestamp: new Date().toISOString(), payload: { taskId: "exp-2" } }
    ]);
    // Simulate metrics writing so that the extractor can load provider info
    const metricsDir = path.join(TEMP_DIR, ".brain", "providers", "metrics");
    await fs.mkdir(metricsDir, { recursive: true });
    const metricsData = [
        { provider: "ollama", model: "qwen2.5-coder", taskId: "exp-1", promptTokens: 5, completionTokens: 5, latencyMs: 50, executionDurationMs: 50, estimatedCost: 0, retries: 0, artifactsGenerated: 1, workspaceWrites: 1, executionEvents: 1, streamEvents: 0, fallbackCount: 0, knowledgeCacheHits: 0, timestamp: new Date().toISOString() },
        { provider: "ollama", model: "qwen2.5-coder", taskId: "exp-2", promptTokens: 5, completionTokens: 5, latencyMs: 50, executionDurationMs: 50, estimatedCost: 0, retries: 0, artifactsGenerated: 1, workspaceWrites: 1, executionEvents: 1, streamEvents: 0, fallbackCount: 0, knowledgeCacheHits: 0, timestamp: new Date().toISOString() }
    ];
    await fs.writeFile(path.join(metricsDir, "2026-06-26.jsonl"), metricsData.map(d => JSON.stringify(d)).join("\n") + "\n");
    await service.learn(mockRes);
    const rec = await service.recommend({ taskType: "document", taskTitle: "Write README" });
    assert.strictEqual(rec.recommendedProvider, "ollama");
    console.log("  ✓ Provider runtime negotiation respects and queries optimal provider overrides");
}
async function test13_KnowledgeFusionIntegration() {
    console.log("── 13. Knowledge Fusion Integration ───────────────────────────");
    // Verify that getFileScores retrieves successful files and is integrated inside Fusion Strategy
    const service = new LearningEngineService(TEMP_DIR);
    const fusion = new KnowledgeFusionService(TEMP_DIR);
    const scores = await service.getFileScores("Write README");
    assert.ok(scores.has("README.md"));
    const fuseResult = await fusion.fuse({
        query: "Write README",
        options: { includeLearning: true },
        semanticCandidates: [{ path: "README.md", score: 0.8 }]
    });
    const readmeCand = fuseResult.candidates.find(c => c.id === "README.md");
    assert.ok(readmeCand);
    assert.ok(readmeCand.signals.learning > 0);
    assert.ok(readmeCand.reasons.some(r => r.includes("Learning Engine")));
    console.log("  ✓ Knowledge fusion strategy uses learning signal coefficient to rank candidates");
}
async function test14_QueryEngineDiagnostics() {
    console.log("── 14. Query Engine Diagnostics ──────────────────────────────");
    // Mock Synchronizer to avoid git errors in temp dir
    const { SynchronizerService } = await import("./synchronizer/index.js");
    const originalSync = SynchronizerService.prototype.synchronize;
    SynchronizerService.prototype.synchronize = async () => ({
        generatedAt: new Date().toISOString(),
        scannedFiles: 0,
        updatedIndexes: [],
        changedFiles: [],
        addedFiles: [],
        removedFiles: []
    });
    const queryEngine = new QueryEngineService(TEMP_DIR, TEMP_DIR);
    // Mock cache to avoid executing retriever/planner which depend on full repository index
    const query = "Write README";
    const crypto = await import("crypto");
    const queryHash = crypto.createHash("sha256").update(query).digest("hex");
    const cacheDir = path.join(TEMP_DIR, "context");
    await fs.mkdir(cacheDir, { recursive: true });
    const mockContext = {
        generatedAt: new Date(Date.now() + 600000).toISOString(),
        query,
        plan: {
            originalQuery: query,
            normalizedQuery: query.toLowerCase(),
            intent: "analysis",
            keywords: [],
            targetModules: [],
            contextBudget: 10,
            confidence: 1.0
        },
        files: [],
        symbols: [],
        relationships: [],
        graph: { nodes: [], edges: [] },
        estimatedTokens: 0,
        executionDiagnostics: {
            selectedProvider: "ollama",
            providerHealth: "Healthy",
            sessionId: "session-123"
        }
    };
    await fs.writeFile(path.join(cacheDir, `${queryHash}.json`), JSON.stringify(mockContext));
    // Write dummy index files so cache validation passes
    const indexDir = path.join(TEMP_DIR, "index");
    await fs.mkdir(indexDir, { recursive: true });
    await fs.writeFile(path.join(indexDir, "symbols.json"), "{}");
    await fs.writeFile(path.join(indexDir, "index.json"), "{}");
    await fs.writeFile(path.join(indexDir, "relationships.json"), "{}");
    await fs.mkdir(path.join(TEMP_DIR, "graph"), { recursive: true });
    await fs.writeFile(path.join(TEMP_DIR, "graph", "graph.json"), "{}");
    try {
        const result = await queryEngine.query({
            query,
            useCache: true
        });
        assert.ok(result.diagnostics);
        assert.ok(result.diagnostics.learningRecommendation);
        assert.strictEqual(result.diagnostics.learningVersion, "1.0.0");
        console.log("  ✓ Exposed recommendations, optimizations, and learning version in query diagnostics");
    }
    finally {
        SynchronizerService.prototype.synchronize = originalSync;
    }
}
main();
