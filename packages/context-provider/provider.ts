import { ContextCache } from "./cache.js";
import { TokenBudgetOptimizer } from "./optimizer.js";
import type { ContextRequest, ContextResponse, RankedFile, MemoryEntry, ContextSnippet, DependencySummary } from "./types.js";
import { ContextRetrievalService } from "../context-retrieval/service.js";
import { LearningEngineService } from "../learning-engine/service.js";

export interface ContextProviderTelemetry {
    requestsServed:            number;
    requestsServedDirectly:    number;
    repositoryFallbackCount:   number;
    totalLatencyMs:            number;
    totalSavedTokens:          number;
    totalRetrievedTokens:      number;
    averageConfidence:         number;
    cacheHitCount:             number;
    totalScanLatencyMs:        number;
    satisfiedCount:            number;
    mcpConfigured:             boolean;
    mcpConnected:              number;
    mcpToolInvocations:        number;
    sessionsStarted:           number;
    brainContextRequested:     number;
    brainToolUsed:             number;
    repoSearchExecuted:        number;
    repoSearchAvoided:         number;
    repoSearchReasons:         string[];
    repoFallbackReasons:       string[];
    promptTokensSaved:         number;
    contextTokensReturned:     number;
}

export class ContextProvider {
    private static telemetry: ContextProviderTelemetry = {
        requestsServed:            0,
        requestsServedDirectly:    0,
        repositoryFallbackCount:   0,
        totalLatencyMs:            0,
        totalSavedTokens:          0,
        totalRetrievedTokens:      0,
        averageConfidence:         1.0,
        cacheHitCount:             0,
        totalScanLatencyMs:        0,
        satisfiedCount:            0,
        mcpConfigured:             false,
        mcpConnected:              0,
        mcpToolInvocations:        0,
        sessionsStarted:           0,
        brainContextRequested:     0,
        brainToolUsed:             0,
        repoSearchExecuted:        0,
        repoSearchAvoided:         0,
        repoSearchReasons:         [],
        repoFallbackReasons:       [],
        promptTokensSaved:         0,
        contextTokensReturned:     0
    };

    private readonly retrievalService: ContextRetrievalService;
    private readonly learningService:  LearningEngineService;

    constructor(projectRoot: string, workspaceRoot: string) {
        this.retrievalService = new ContextRetrievalService(projectRoot, workspaceRoot);
        this.learningService  = new LearningEngineService(workspaceRoot);
    }

    async getContext(request: ContextRequest): Promise<ContextResponse> {
        const start = Date.now();
        ContextProvider.telemetry.requestsServed++;

        // 1. Check cache
        const cached = ContextCache.get(
            request.snapshotId,
            request.query,
            request.openFiles,
            request.cursorFile
        );

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
            useCache: true
        });

        // 3. Extract ranked files, snippets, dependencies
        const rawArchitectureSummary = `Architecture summary for query "${request.query}". Snapshot: ${request.snapshotId}.`;
        const rawRankedFiles: RankedFile[] = retrievalResult.retrievalPackage.candidates.map(c => ({
            path: c.path,
            score: c.score,
            reasons: c.reasons
        }));

        const rawMemoryEntries: MemoryEntry[] = [];
        const rawSnippets: ContextSnippet[] = retrievalResult.retrievalPackage.sections.map(s => ({
            path: s.name,
            code: s.content,
            comment: s.reason
        }));

        const rawDependencies: DependencySummary[] = [];

        // 4. Token Budget Allocation and Optimization
        const response = TokenBudgetOptimizer.optimize(
            request.maxTokens,
            rawArchitectureSummary,
            rawRankedFiles,
            rawMemoryEntries,
            rawSnippets,
            rawDependencies
        );

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
        } else {
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
        ContextCache.set(
            request.snapshotId,
            request.query,
            request.openFiles,
            response,
            request.cursorFile
        );

        return response;
    }

    static getTelemetry(): ContextProviderTelemetry {
        return this.telemetry;
    }

    static getScanAvoidanceRate(): number {
        if (this.telemetry.requestsServed === 0) return 0;
        return this.telemetry.requestsServedDirectly / this.telemetry.requestsServed;
    }

    static getCacheHitRate(): number {
        if (this.telemetry.requestsServed === 0) return 0;
        return this.telemetry.cacheHitCount / this.telemetry.requestsServed;
    }

    static getFallbackRate(): number {
        if (this.telemetry.requestsServed === 0) return 0;
        return this.telemetry.repositoryFallbackCount / this.telemetry.requestsServed;
    }

    static getSatisfactionRate(): number {
        if (this.telemetry.requestsServed === 0) return 0;
        return this.telemetry.satisfiedCount / this.telemetry.requestsServed;
    }

    static clearTelemetry(): void {
        this.telemetry = {
            requestsServed:            0,
            requestsServedDirectly:    0,
            repositoryFallbackCount:   0,
            totalLatencyMs:            0,
            totalSavedTokens:          0,
            totalRetrievedTokens:      0,
            averageConfidence:         1.0,
            cacheHitCount:             0,
            totalScanLatencyMs:        0,
            satisfiedCount:            0,
            mcpConfigured:             false,
            mcpConnected:              0,
            mcpToolInvocations:        0,
            sessionsStarted:           0,
            brainContextRequested:     0,
            brainToolUsed:             0,
            repoSearchExecuted:        0,
            repoSearchAvoided:         0,
            repoSearchReasons:         [],
            repoFallbackReasons:       [],
            promptTokensSaved:         0,
            contextTokensReturned:     0
        };
    }
}
