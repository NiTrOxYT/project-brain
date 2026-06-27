import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { FileSystemService } from "../filesystem/index.js";
import { SynchronizerService } from "../synchronizer/index.js";
export class QueryEngineService {
    projectRoot;
    workspaceRoot;
    filesystem = new FileSystemService();
    constructor(projectRoot, workspaceRoot) {
        this.projectRoot = projectRoot;
        this.workspaceRoot = workspaceRoot;
    }
    async query(request) {
        const totalStart = Date.now();
        let synchronized = false;
        let planningTimeMs = 0;
        let retrievalTimeMs = 0;
        let assemblyTimeMs = 0;
        let cacheHit = false;
        let retrievedFilesCount = 0;
        let retrievalDuration = 0;
        let retrievedSymbols = 0;
        let retrievedRules = 0;
        let compressionRatio = 1.0;
        let retrievalCacheHit = false;
        let tokenEstimate = 0;
        try {
            // 1. Run Synchronizer Check
            try {
                const synchronizer = new SynchronizerService(this.projectRoot, this.workspaceRoot);
                const syncState = await synchronizer.synchronize();
                synchronized =
                    syncState.changedFiles.length > 0 ||
                        syncState.addedFiles.length > 0 ||
                        syncState.removedFiles.length > 0;
            }
            catch (error) {
                // Return gracefully with sync error details
                return await this.createErrorResult(request, `Synchronization failed: ${error.message}`, totalStart);
            }
            // 2. Cache Validation & Fetch
            const queryHashInput = (request.maxTokens || request.includeExecution || request.includeRelationships || request.includeGraph || request.includeArchitectureMemory)
                ? JSON.stringify({
                    query: request.query,
                    maxTokens: request.maxTokens || undefined,
                    includeExecution: request.includeExecution || undefined,
                    includeRelationships: request.includeRelationships || undefined,
                    includeGraph: request.includeGraph || undefined,
                    includeArchitectureMemory: request.includeArchitectureMemory || undefined
                })
                : request.query;
            const queryHash = crypto
                .createHash("sha256")
                .update(queryHashInput)
                .digest("hex");
            const cachePath = path.join(this.workspaceRoot, "context", `${queryHash}.json`);
            const context = {
                generatedAt: new Date().toISOString(),
                query: request.query,
                plan: {
                    originalQuery: request.query,
                    normalizedQuery: request.query.toLowerCase(),
                    intent: "analysis",
                    keywords: [],
                    targetModules: [],
                    contextBudget: 10,
                    confidence: 0.0
                },
                files: [],
                symbols: [],
                relationships: [],
                graph: { nodes: [], edges: [] },
                estimatedTokens: 0
            };
            let hasContext = false;
            if (request.useCache !== false && await this.filesystem.exists(cachePath)) {
                try {
                    const cached = await this.filesystem.readJson(cachePath);
                    const symbolsPath = path.join(this.workspaceRoot, "index", "symbols.json");
                    const indexPath = path.join(this.workspaceRoot, "index", "index.json");
                    const relationshipsPath = path.join(this.workspaceRoot, "index", "relationships.json");
                    const graphPath = path.join(this.workspaceRoot, "graph", "graph.json");
                    const [symbolsStat, indexStat, relStat, graphStat] = await Promise.all([
                        fs.stat(symbolsPath).catch(() => null),
                        fs.stat(indexPath).catch(() => null),
                        fs.stat(relationshipsPath).catch(() => null),
                        fs.stat(graphPath).catch(() => null)
                    ]);
                    const cachedTime = new Date(cached.generatedAt).getTime();
                    let isValid = true;
                    if (symbolsStat && symbolsStat.mtime.getTime() > cachedTime)
                        isValid = false;
                    if (indexStat && indexStat.mtime.getTime() > cachedTime)
                        isValid = false;
                    if (relStat && relStat.mtime.getTime() > cachedTime)
                        isValid = false;
                    if (graphStat && graphStat.mtime.getTime() > cachedTime)
                        isValid = false;
                    if (isValid) {
                        cacheHit = true;
                        Object.assign(context, cached);
                        hasContext = true;
                    }
                }
                catch {
                    // Ignore cache read failures and regenerate
                }
            }
            // 3. Execution flow if cache missed
            if (!hasContext) {
                const { ContextRetrievalService } = await import("../context-retrieval/index.js");
                const retrievalService = new ContextRetrievalService(this.projectRoot, this.workspaceRoot);
                const retrieveStart = Date.now();
                const res = await retrievalService.retrieve({
                    query: request.query,
                    maxTokens: request.maxTokens,
                    includeExecution: request.includeExecution,
                    includeRelationships: request.includeRelationships,
                    includeGraph: request.includeGraph,
                    includeArchitectureMemory: request.includeArchitectureMemory
                });
                retrievalTimeMs = Date.now() - retrieveStart;
                retrievedFilesCount = res.retrievalPackage.candidates.length;
                retrievalDuration = res.metrics.retrievalDurationMs;
                retrievedFilesCount = res.metrics.retrievedFilesCount;
                retrievedSymbols = res.metrics.retrievedSymbolsCount;
                retrievedRules = res.metrics.retrievedRulesCount;
                compressionRatio = res.metrics.compressionRatio;
                retrievalCacheHit = res.cacheHit;
                tokenEstimate = res.metrics.tokenEstimate;
                // Map to ContextPackage
                const tempContext = {
                    generatedAt: new Date().toISOString(),
                    query: request.query,
                    plan: {
                        originalQuery: request.query,
                        normalizedQuery: request.query.toLowerCase(),
                        intent: "analysis",
                        keywords: [],
                        targetModules: [],
                        contextBudget: 10,
                        confidence: 1.0
                    },
                    files: res.retrievalPackage.candidates.map(c => ({
                        path: c.path,
                        score: c.score,
                        estimatedTokens: 0
                    })),
                    symbols: res.retrievalPackage.symbols.map(s => ({
                        name: s.name,
                        kind: s.kind,
                        file: s.filePath,
                        line: s.line
                    })),
                    relationships: res.retrievalPackage.relationships.map(r => ({
                        source: r.subject,
                        target: r.object,
                        type: r.predicate,
                        file: "",
                        line: 0
                    })),
                    graph: {
                        nodes: res.retrievalPackage.graph.nodes.map(n => ({
                            id: n.id,
                            type: n.type
                        })),
                        edges: res.retrievalPackage.graph.edges.map(e => ({
                            from: e.fromId,
                            to: e.toId,
                            type: e.kind
                        }))
                    },
                    architecture: [],
                    evolution: [],
                    learning: [],
                    estimatedTokens: res.metrics.tokenEstimate
                };
                Object.assign(context, tempContext);
            }
            else {
                retrievedFilesCount = context.files.length;
            }
            const totalTimeMs = Date.now() - totalStart;
            let learningRecommendation = undefined;
            let optimizationRulesUsed = [];
            let providerConfidence = 0.0;
            let promptConfidence = 0.0;
            let learningVersion = "1.0.0";
            try {
                const { LearningEngineService } = await import("../learning-engine/index.js");
                const learningEngine = new LearningEngineService(this.workspaceRoot);
                const rec = await learningEngine.recommend({
                    taskType: "refactor",
                    taskTitle: request.query
                });
                learningRecommendation = rec;
                optimizationRulesUsed = rec.rulesApplied;
                providerConfidence = rec.providerConfidence;
                promptConfidence = rec.promptConfidence;
                const snapshot = await learningEngine.snapshot();
                learningVersion = snapshot.metadata?.version || "1.0.0";
            }
            catch {
                // ignore
            }
            // Collect Shared Memory / Collaboration diagnostics (best-effort)
            let activeAgents;
            let completedAgents;
            let collaborationEfficiency;
            let consensusDuration;
            let conflictsDetected;
            let conflictsResolved;
            let artifactReuseRate;
            try {
                const { SharedMemoryService } = await import("../shared-memory/service.js");
                const sharedMem = new SharedMemoryService(this.workspaceRoot, this.workspaceRoot);
                const stats = await sharedMem.statistics();
                if (stats) {
                    activeAgents = stats.activeAgents;
                    collaborationEfficiency = stats.duplicateAvoided > 0 ? 0.95 : 0.8;
                    consensusDuration = stats.averageConsensusMs;
                    conflictsDetected = stats.totalConflicts;
                    conflictsResolved = stats.resolvedConflicts;
                    artifactReuseRate = stats.duplicateAvoided;
                }
            }
            catch { /* best-effort */ }
            // Collect Context Compiler snapshot diagnostics (best-effort)
            let snapshotId;
            let snapshotVersion;
            let snapshotTokens;
            let snapshotIncremental;
            let snapshotCacheHit;
            let snapshotFileCount;
            let snapshotSymbolCount;
            let snapshotCompilationMs;
            try {
                const { ContextSynchronizationService } = await import("../context-sync/index.js");
                const syncService = new ContextSynchronizationService(this.projectRoot, this.workspaceRoot);
                const latestSnap = await syncService.latestSnapshot();
                if (latestSnap) {
                    snapshotId = latestSnap.snapshotId;
                    snapshotVersion = latestSnap.metadata.fingerprint.version;
                    snapshotTokens = latestSnap.metadata.estimatedTokens;
                    snapshotIncremental = latestSnap.metadata.incremental;
                    snapshotCacheHit = true;
                    snapshotFileCount = latestSnap.metadata.fileCount;
                    snapshotSymbolCount = latestSnap.metadata.symbolCount;
                    snapshotCompilationMs = latestSnap.metadata.compilationDurationMs;
                }
            }
            catch {
                // ignore — snapshot is optional
            }
            return {
                generatedAt: new Date().toISOString(),
                request,
                context,
                diagnostics: {
                    cacheHit,
                    synchronized,
                    planningTimeMs,
                    retrievalTimeMs,
                    assemblyTimeMs,
                    totalTimeMs,
                    retrievedFiles: retrievedFilesCount,
                    selectedFiles: context.files.length,
                    selectedSymbols: context.symbols.length,
                    selectedRelationships: context.relationships.length,
                    selectedProvider: context.executionDiagnostics?.selectedProvider,
                    providerHealth: context.executionDiagnostics?.providerHealth,
                    runtimeMetricsSummary: context.executionDiagnostics?.runtimeMetricsSummary,
                    executionSnapshotId: context.executionDiagnostics?.executionSnapshotId,
                    workspaceDiagnostics: context.executionDiagnostics?.workspaceDiagnostics
                        ? {
                            totalTransactions: context.executionDiagnostics.workspaceDiagnostics.totalTransactions,
                            totalChanges: context.executionDiagnostics.workspaceDiagnostics.totalChanges,
                            totalPatchesApplied: context.executionDiagnostics.workspaceDiagnostics.totalPatchesApplied,
                            rolledBackTransactions: context.executionDiagnostics.workspaceDiagnostics.rolledBackTransactions,
                            totalArtifactsApplied: 0,
                            activeLocks: 0
                        }
                        : undefined,
                    // Provider SDK diagnostics
                    providerVersion: context.executionDiagnostics?.providerVersion,
                    selectedModel: context.executionDiagnostics?.selectedModel,
                    sessionId: context.executionDiagnostics?.sessionId,
                    promptTokens: context.executionDiagnostics?.promptTokens,
                    completionTokens: context.executionDiagnostics?.completionTokens,
                    estimatedCost: context.executionDiagnostics?.estimatedCost,
                    fallbackChain: context.executionDiagnostics?.fallbackChain,
                    selectionReason: context.executionDiagnostics?.selectionReason,
                    capabilityScore: context.executionDiagnostics?.capabilityScore,
                    // Learning diagnostics
                    learningRecommendation,
                    optimizationRulesUsed,
                    providerConfidence,
                    promptConfidence,
                    learningVersion,
                    // Shared Memory diagnostics
                    activeAgents,
                    completedAgents,
                    collaborationEfficiency,
                    consensusDuration,
                    conflictsDetected,
                    conflictsResolved,
                    artifactReuseRate,
                    // Context Compiler / Semantic Snapshot diagnostics
                    snapshotId,
                    snapshotVersion,
                    snapshotTokens,
                    snapshotIncremental,
                    snapshotCacheHit,
                    snapshotFileCount,
                    snapshotSymbolCount,
                    snapshotCompilationMs,
                    // Context Retrieval diagnostics
                    retrievalDuration,
                    retrievedSymbols,
                    retrievedRules,
                    compressionRatio,
                    retrievalCacheHit,
                    tokenEstimate
                }
            };
        }
        catch (error) {
            return await this.createErrorResult(request, `Query failed: ${error.message}`, totalStart);
        }
    }
    async createErrorResult(request, errorMessage, startTime) {
        const totalTimeMs = Date.now() - startTime;
        let activeAgents;
        let collaborationEfficiency;
        let consensusDuration;
        let conflictsDetected;
        let conflictsResolved;
        let artifactReuseRate;
        try {
            const { SharedMemoryService } = await import("../shared-memory/service.js");
            const sharedMem = new SharedMemoryService(this.workspaceRoot, this.workspaceRoot);
            const stats = await sharedMem.statistics();
            if (stats) {
                activeAgents = stats.activeAgents;
                collaborationEfficiency = stats.duplicateAvoided > 0 ? 0.95 : 0.8;
                consensusDuration = stats.averageConsensusMs;
                conflictsDetected = stats.totalConflicts;
                conflictsResolved = stats.resolvedConflicts;
                artifactReuseRate = stats.duplicateAvoided;
            }
        }
        catch { /* best-effort */ }
        const emptyContext = {
            generatedAt: new Date().toISOString(),
            query: request.query,
            plan: {
                originalQuery: request.query,
                normalizedQuery: request.query.toLowerCase(),
                intent: "analysis",
                keywords: [],
                targetModules: [],
                contextBudget: 10,
                confidence: 0.0
            },
            files: [],
            symbols: [],
            relationships: [],
            graph: { nodes: [], edges: [] },
            estimatedTokens: 0
        };
        return {
            generatedAt: new Date().toISOString(),
            request,
            context: emptyContext,
            diagnostics: {
                cacheHit: false,
                synchronized: false,
                planningTimeMs: 0,
                retrievalTimeMs: 0,
                assemblyTimeMs: 0,
                totalTimeMs,
                retrievedFiles: 0,
                selectedFiles: 0,
                selectedSymbols: 0,
                selectedRelationships: 0,
                error: errorMessage,
                // Shared Memory diagnostics
                activeAgents,
                collaborationEfficiency,
                consensusDuration,
                conflictsDetected,
                conflictsResolved,
                artifactReuseRate
            }
        };
    }
}
