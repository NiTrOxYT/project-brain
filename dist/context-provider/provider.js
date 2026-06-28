import { ContextCache } from "./cache.js";
import { TokenBudgetOptimizer } from "./optimizer.js";
import { ContextRetrievalService } from "../context-retrieval/service.js";
import { LearningEngineService } from "../learning-engine/service.js";
export class ContextProvider {
    static telemetry = {
        requestsServed: 0,
        requestsServedDirectly: 0,
        repositoryFallbackCount: 0,
        totalLatencyMs: 0,
        totalSavedTokens: 0,
        totalRetrievedTokens: 0,
        averageConfidence: 1.0,
        cacheHitCount: 0,
        totalScanLatencyMs: 0,
        satisfiedCount: 0,
        mcpConfigured: false,
        mcpConnected: 0,
        mcpToolInvocations: 0,
        sessionsStarted: 0,
        brainContextRequested: 0,
        brainToolUsed: 0,
        repoSearchExecuted: 0,
        repoSearchAvoided: 0,
        repoSearchReasons: [],
        repoFallbackReasons: [],
        promptTokensSaved: 0,
        contextTokensReturned: 0
    };
    retrievalService;
    learningService;
    constructor(projectRoot, workspaceRoot) {
        this.retrievalService = new ContextRetrievalService(projectRoot, workspaceRoot);
        this.learningService = new LearningEngineService(workspaceRoot);
    }
    async getContext(request) {
        const start = Date.now();
        ContextProvider.telemetry.requestsServed++;
        // 1. Check cache
        const cached = ContextCache.get(request.snapshotId, request.query, request.openFiles, request.cursorFile);
        if (cached) {
            ContextProvider.telemetry.requestsServedDirectly++;
            ContextProvider.telemetry.cacheHitCount++;
            ContextProvider.telemetry.satisfiedCount++;
            const latency = Date.now() - start;
            ContextProvider.telemetry.totalLatencyMs += latency;
            return {
                ...cached,
                retrievalTimeMs: latency
            };
        }
        // 2. Fetch context from Retrieval Service
        const retrievalResult = await this.retrievalService.retrieve({
            query: request.query,
            maxTokens: request.maxTokens,
            providerId: request.providerId,
            useCache: true,
            snapshotId: request.snapshotId
        });
        // 3. Extract ranked files, snippets, dependencies
        //    Pull the live snapshot so we can extract architecture + memory
        const snapshot = await this.retrievalService.latestSnapshot();
        // Architecture summary — from real snapshot entries
        let rawArchitectureSummary = "";
        if (snapshot && snapshot.architecture && snapshot.architecture.length > 0) {
            rawArchitectureSummary = snapshot.architecture
                .slice(0, 20)
                .map(e => `[${e.category}] ${e.title}: ${e.description}`)
                .join("\n");
        }
        else {
            rawArchitectureSummary = `Architecture summary for query "${request.query}". Snapshot: ${request.snapshotId}.`;
        }
        const rawRankedFiles = retrievalResult.retrievalPackage.candidates.map(c => ({
            path: c.path,
            score: c.score,
            reasons: c.reasons
        }));
        // Semantic memory — from snapshot.semanticMemory + architecture entries
        const rawMemoryEntries = [];
        if (snapshot) {
            // From semanticMemory
            const queryTerms = request.query.toLowerCase().split(/\s+/).filter(Boolean);
            if (snapshot.semanticMemory) {
                for (const entry of snapshot.semanticMemory.slice(0, 200)) {
                    let matchCount = 0;
                    for (const term of queryTerms) {
                        if (entry.terms?.includes(term) || entry.file?.toLowerCase().includes(term))
                            matchCount++;
                    }
                    if (matchCount > 0 || rawMemoryEntries.length < 5) {
                        rawMemoryEntries.push({
                            id: entry.id || `${entry.file}::semantic`,
                            type: "semantic",
                            content: `File: ${entry.file} — symbols: ${entry.terms?.slice(0, 5).join(", ")}`,
                            confidence: Math.min(0.99, 0.5 + (matchCount / Math.max(1, queryTerms.length)) * 0.5)
                        });
                    }
                    if (rawMemoryEntries.length >= 15)
                        break;
                }
            }
            // From architecture entries
            if (snapshot.architecture) {
                for (const arch of snapshot.architecture.slice(0, 10)) {
                    rawMemoryEntries.push({
                        id: `arch::${arch.category}::${arch.title}`,
                        type: "architecture",
                        content: `[${arch.category}] ${arch.title}: ${arch.description}`,
                        confidence: 0.9
                    });
                }
            }
        }
        // Dependency summary — from snapshot.dependencies, grouped by file
        const rawDependencies = [];
        if (snapshot && snapshot.dependencies) {
            const grouped = new Map();
            for (const dep of snapshot.dependencies.slice(0, 500)) {
                if (!grouped.has(dep.fromPath))
                    grouped.set(dep.fromPath, []);
                grouped.get(dep.fromPath).push(dep.toPath);
            }
            // Only include files that appear in ranked results or top candidates
            const relevantFiles = new Set(rawRankedFiles.slice(0, 20).map(f => f.path));
            for (const [file, imports] of grouped) {
                if (relevantFiles.has(file) || rawDependencies.length < 10) {
                    rawDependencies.push({ file, imports: imports.slice(0, 10) });
                    if (rawDependencies.length >= 20)
                        break;
                }
            }
        }
        const rawSnippets = retrievalResult.retrievalPackage.sections.map(s => ({
            path: s.name,
            code: s.content,
            comment: s.reason
        }));
        // 4. Token Budget Allocation and Optimization
        const response = TokenBudgetOptimizer.optimize(request.maxTokens, rawArchitectureSummary, rawRankedFiles, rawMemoryEntries, rawSnippets, rawDependencies);
        // 5. Update confidence
        let confidence = 0.95;
        ContextProvider.telemetry.brainContextRequested++;
        ContextProvider.telemetry.brainToolUsed++;
        ContextProvider.telemetry.mcpToolInvocations++;
        if (response.snippets.length === 0) {
            confidence = 0.1; // low confidence if no snippets retrieved
            ContextProvider.telemetry.repositoryFallbackCount++;
            ContextProvider.telemetry.repoSearchExecuted++;
            ContextProvider.telemetry.repoFallbackReasons.push("Low confidence, empty snippets retrieved.");
            ContextProvider.telemetry.totalScanLatencyMs += 1500; // Simulated scan fallback latency
        }
        else {
            ContextProvider.telemetry.requestsServedDirectly++;
            ContextProvider.telemetry.satisfiedCount++;
            ContextProvider.telemetry.repoSearchAvoided++;
            ContextProvider.telemetry.repoSearchReasons.push("High-confidence context returned from ContextProvider.");
        }
        response.confidence = confidence;
        const latency = Date.now() - start;
        response.retrievalTimeMs = latency;
        ContextProvider.telemetry.totalLatencyMs += latency;
        ContextProvider.telemetry.totalRetrievedTokens += response.estimatedTokens;
        // Mock token savings (Baseline repository scan = 420000, context retrieve = optimized response)
        const savedTokens = Math.max(0, 420000 - response.estimatedTokens);
        ContextProvider.telemetry.totalSavedTokens += savedTokens;
        ContextProvider.telemetry.promptTokensSaved += savedTokens;
        ContextProvider.telemetry.contextTokensReturned += response.estimatedTokens;
        // Recalculate average confidence
        const total = ContextProvider.telemetry.requestsServed;
        const currentAvg = ContextProvider.telemetry.averageConfidence;
        ContextProvider.telemetry.averageConfidence = ((currentAvg * (total - 1)) + confidence) / total;
        // 6. Write cache
        ContextCache.set(request.snapshotId, request.query, request.openFiles, response, request.cursorFile);
        return response;
    }
    async getLatestSnapshot() {
        return this.retrievalService.latestSnapshot();
    }
    static getTelemetry() {
        return this.telemetry;
    }
    static getScanAvoidanceRate() {
        if (this.telemetry.requestsServed === 0)
            return 0;
        return this.telemetry.requestsServedDirectly / this.telemetry.requestsServed;
    }
    static getCacheHitRate() {
        if (this.telemetry.requestsServed === 0)
            return 0;
        return this.telemetry.cacheHitCount / this.telemetry.requestsServed;
    }
    static getFallbackRate() {
        if (this.telemetry.requestsServed === 0)
            return 0;
        return this.telemetry.repositoryFallbackCount / this.telemetry.requestsServed;
    }
    static getSatisfactionRate() {
        if (this.telemetry.requestsServed === 0)
            return 0;
        return this.telemetry.satisfiedCount / this.telemetry.requestsServed;
    }
    static clearTelemetry() {
        this.telemetry = {
            requestsServed: 0,
            requestsServedDirectly: 0,
            repositoryFallbackCount: 0,
            totalLatencyMs: 0,
            totalSavedTokens: 0,
            totalRetrievedTokens: 0,
            averageConfidence: 1.0,
            cacheHitCount: 0,
            totalScanLatencyMs: 0,
            satisfiedCount: 0,
            mcpConfigured: false,
            mcpConnected: 0,
            mcpToolInvocations: 0,
            sessionsStarted: 0,
            brainContextRequested: 0,
            brainToolUsed: 0,
            repoSearchExecuted: 0,
            repoSearchAvoided: 0,
            repoSearchReasons: [],
            repoFallbackReasons: [],
            promptTokensSaved: 0,
            contextTokensReturned: 0
        };
    }
}
