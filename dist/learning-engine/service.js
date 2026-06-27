// ──────────────────────────────────────────────────────────────────────────────
// BUILD-052 — Learning Engine — Main Service
// ──────────────────────────────────────────────────────────────────────────────
import { LearningStorage } from "./storage";
import { LearningExtractor } from "./extractor";
import { LearningClassifier } from "./classifier";
import { RepairPatternsLearner } from "./repair-patterns";
import { ProviderPerformanceTracker } from "./provider-performance";
import { PromptLibrary } from "./prompt-library";
import { LearningOptimizer } from "./optimizer";
import { LearningRecommender } from "./recommender";
import { LearningMetricsTracker } from "./metrics";
export class LearningEngineService {
    workspaceRoot;
    storage;
    extractor;
    classifier = new LearningClassifier();
    repairLearner = new RepairPatternsLearner();
    providerTracker = new ProviderPerformanceTracker();
    promptLib = new PromptLibrary();
    optimizerService = new LearningOptimizer();
    recommender = new LearningRecommender();
    metricsTracker = new LearningMetricsTracker();
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.storage = new LearningStorage(workspaceRoot);
        this.extractor = new LearningExtractor(workspaceRoot);
    }
    async learn(execution) {
        if (!execution || !execution.journal || execution.journal.length === 0) {
            return { success: false, recordsAdded: 0 };
        }
        // Extract experiences
        const newExps = await this.extractor.extract(execution);
        if (newExps.length === 0) {
            return { success: false, recordsAdded: 0 };
        }
        // Load current db
        const experiences = await this.storage.loadExperiences();
        const providers = await this.storage.loadProviders();
        const repairs = await this.storage.loadRepairs();
        const failures = await this.storage.loadFailures();
        const prompts = await this.storage.loadPrompts();
        let optimizations = await this.storage.loadOptimizations();
        const metadata = await this.storage.loadMetadata();
        // Update experiences
        experiences.push(...newExps);
        // Learn repair patterns
        const updatedRepairs = this.repairLearner.learn(newExps, repairs);
        // Update provider performance
        const updatedProviders = this.providerTracker.update(experiences);
        // Record prompts if present in the execution journal/responses
        let updatedPrompts = prompts;
        for (const exp of newExps) {
            // Find prompt bodies in task journal payloads if any
            const taskEvents = execution.journal.filter(e => e.payload?.taskId === exp.id.split("-").slice(-2)[0]);
            const startedEvent = taskEvents.find(e => e.type === "TaskStarted");
            const promptBody = startedEvent?.payload?.promptBody || startedEvent?.payload?.prompt || startedEvent?.payload?.taskTitle;
            if (promptBody) {
                updatedPrompts = this.promptLib.record(updatedPrompts, exp.providerId, exp.taskType, promptBody, exp.outcome === "success" ? "success" : "failure", exp.validationScore, exp.repairCycles, exp.tokensUsed, exp.cost);
            }
        }
        // Regenerate optimization rules
        optimizations = this.optimizerService.generateRules(experiences, updatedProviders, updatedRepairs);
        // Save everything
        await this.storage.saveExperiences(experiences);
        await this.storage.saveProviders(updatedProviders);
        await this.storage.saveRepairs(updatedRepairs);
        await this.storage.savePrompts(updatedPrompts);
        await this.storage.saveOptimizations(optimizations);
        // Record latest snapshot fingerprint and sync metrics in metadata for traceability
        let snapshotFingerprint;
        let syncLatency;
        let syncPatchSize;
        let syncDirtyRegionSize;
        let syncSnapshotReuseRatio;
        let retrievalAvgFiles;
        let retrievalAvgSymbols;
        let retrievalAvgCompressionRatio;
        let retrievalAvgTokens;
        let retrievalSuccessRate;
        let collaborationEfficiency;
        let conflictFrequency;
        let providerCooperation;
        let artifactReuseRate;
        let consensusQuality;
        try {
            const { ContextSynchronizationService } = await import("../context-sync");
            const syncService = new ContextSynchronizationService(this.workspaceRoot, this.workspaceRoot);
            const latestSnap = await syncService.latestSnapshot();
            if (latestSnap) {
                snapshotFingerprint = latestSnap.metadata.fingerprint.hash;
            }
            const syncStats = await syncService.statistics();
            if (syncStats) {
                syncLatency = syncStats.averageSyncDurationMs;
                syncPatchSize = syncStats.averagePatchSizeBytes;
                syncDirtyRegionSize = syncStats.averageDirtyFiles;
                syncSnapshotReuseRatio = syncStats.cacheHitRatio;
            }
        }
        catch { /* best-effort */ }
        try {
            const { ContextRetrievalService } = await import("../context-retrieval");
            const retrievalService = new ContextRetrievalService(this.workspaceRoot, this.workspaceRoot);
            const retrievalStats = await retrievalService.statistics();
            if (retrievalStats) {
                retrievalAvgFiles = retrievalStats.averageFilesRetrieved;
                retrievalAvgSymbols = retrievalStats.averageSymbolsRetrieved;
                retrievalAvgCompressionRatio = retrievalStats.compressionRatioAverage;
                retrievalAvgTokens = retrievalStats.averageTokens;
                retrievalSuccessRate = retrievalStats.cacheHitRate;
            }
        }
        catch { /* best-effort */ }
        try {
            const { SharedMemoryService } = await import("../shared-memory");
            const sharedMem = new SharedMemoryService(this.workspaceRoot, this.workspaceRoot);
            const stats = await sharedMem.statistics();
            if (stats) {
                collaborationEfficiency = stats.duplicateAvoided > 0 ? 0.95 : 0.8;
                conflictFrequency = stats.totalConflicts;
                providerCooperation = stats.activeAgents > 1 ? 0.9 : 0.5;
                artifactReuseRate = stats.duplicateAvoided;
                consensusQuality = stats.averageConsensusMs > 0 ? 0.99 : 0.0;
            }
        }
        catch { /* best-effort */ }
        const updatedMetadata = {
            ...metadata,
            lastLearnAt: new Date().toISOString(),
            snapshotFingerprint,
            syncLatency,
            syncPatchSize,
            syncDirtyRegionSize,
            syncSnapshotReuseRatio,
            retrievalAvgFiles,
            retrievalAvgSymbols,
            retrievalAvgCompressionRatio,
            retrievalAvgTokens,
            collaborationEfficiency,
            conflictFrequency,
            providerCooperation,
            artifactReuseRate,
            consensusQuality
        };
        await this.storage.saveMetadata(updatedMetadata);
        const stats = this.metricsTracker.compute(experiences, optimizations);
        return {
            success: true,
            recordsAdded: newExps.length,
            diagnostics: {
                version: metadata.version || "1.0.0",
                statistics: stats,
                databaseSize: experiences.length,
                lastCompactTime: metadata.lastCompactTime
            }
        };
    }
    async recommend(request) {
        const rules = await this.storage.loadOptimizations();
        const providers = await this.storage.loadProviders();
        const prompts = await this.storage.loadPrompts();
        const repairs = await this.storage.loadRepairs();
        return this.recommender.recommend(request, rules, providers, prompts, repairs);
    }
    async providerRecommendation(request) {
        const rec = await this.recommend(request);
        return rec.recommendedProvider;
    }
    async repairRecommendation(request) {
        const rec = await this.recommend(request);
        return rec.recommendedRepairStrategy || "refactor";
    }
    async promptRecommendation(request) {
        const rec = await this.recommend(request);
        return rec.recommendedPrompt || "";
    }
    async optimizer() {
        return this.storage.loadOptimizations();
    }
    async statistics() {
        const experiences = await this.storage.loadExperiences();
        const optimizations = await this.storage.loadOptimizations();
        return this.metricsTracker.compute(experiences, optimizations);
    }
    async snapshot() {
        return this.storage.exportSnapshot();
    }
    async export() {
        return this.storage.exportSnapshot();
    }
    async import(snapshot) {
        await this.storage.importSnapshot(snapshot);
    }
    async compact() {
        await this.storage.compaction();
    }
    async reset() {
        await this.storage.reset();
    }
    // Helper for Knowledge Fusion Integration
    async getFileScores(query) {
        const scores = new Map();
        try {
            const experiences = await this.storage.loadExperiences();
            const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
            for (const exp of experiences) {
                if (exp.outcome !== "success")
                    continue;
                let match = false;
                const taskTitle = (exp.taskTitle || "").toLowerCase();
                const taskType = (exp.taskType || "").toLowerCase();
                if (queryWords.some(word => taskTitle.includes(word) || taskType.includes(word))) {
                    match = true;
                }
                if (match && exp.filesModified) {
                    for (const file of exp.filesModified) {
                        scores.set(file, (scores.get(file) ?? 0) + 1.0);
                    }
                }
            }
        }
        catch { }
        return scores;
    }
}
