import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

import { FileSystemService } from "../filesystem";
import { SynchronizerService } from "../synchronizer";
import { PlannerService } from "../planner";
import { RetrieverService } from "../retriever";
import { ContextAssemblerService, ContextPackage } from "../context-assembler";
import { QueryRequest, QueryResult, QueryDiagnostics } from "./types";
import { QueryEngineError } from "./errors";

export class QueryEngineService {

    private readonly filesystem = new FileSystemService();

    constructor(
        private readonly projectRoot: string,
        private readonly workspaceRoot: string
    ) {}

    async query(request: QueryRequest): Promise<QueryResult> {

        const totalStart = Date.now();
        let synchronized = false;
        let planningTimeMs = 0;
        let retrievalTimeMs = 0;
        let assemblyTimeMs = 0;
        let cacheHit = false;
        let retrievedFilesCount = 0;

        try {

            // 1. Run Synchronizer Check
            try {

                const synchronizer = new SynchronizerService(this.projectRoot, this.workspaceRoot);
                const syncState = await synchronizer.synchronize();

                synchronized =
                    syncState.changedFiles.length > 0 ||
                    syncState.addedFiles.length > 0 ||
                    syncState.removedFiles.length > 0;

            } catch (error: any) {
                // Return gracefully with sync error details
                return this.createErrorResult(request, `Synchronization failed: ${error.message}`, totalStart);
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
            let context: ContextPackage | null = null;

            if (request.useCache !== false && await this.filesystem.exists(cachePath)) {

                try {

                    const cached = await this.filesystem.readJson<ContextPackage>(cachePath);

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

                    if (symbolsStat && symbolsStat.mtime.getTime() > cachedTime) isValid = false;
                    if (indexStat && indexStat.mtime.getTime() > cachedTime) isValid = false;
                    if (relStat && relStat.mtime.getTime() > cachedTime) isValid = false;
                    if (graphStat && graphStat.mtime.getTime() > cachedTime) isValid = false;

                    if (isValid) {
                        cacheHit = true;
                        context = cached;
                    }

                } catch {
                    // Ignore cache read failures and regenerate
                }

            }

            // 3. Execution flow if cache missed
            if (!context) {

                const planStart = Date.now();
                const planner = new PlannerService(this.workspaceRoot);
                const plan = await planner.plan(request.query);
                planningTimeMs = Date.now() - planStart;

                const retrieveStart = Date.now();
                const retriever = new RetrieverService(this.workspaceRoot);
                const retrieval = await retriever.retrieve({
                    query: plan.keywords.join(" "),
                    limit: 20
                });
                retrievalTimeMs = Date.now() - retrieveStart;
                retrievedFilesCount = retrieval.files.length;

                // Call Knowledge Fusion Engine
                const { KnowledgeFusionService } = await import("../knowledge-fusion");
                const fusion = new KnowledgeFusionService(this.workspaceRoot);
                const semanticCandidates = retrieval.files.map(f => ({ path: f.path, score: f.score }));

                const fusionResult = await fusion.fuse({
                    query: request.query,
                    options: {
                        includeExecution: request.includeExecution,
                        includeRelationships: request.includeRelationships,
                        includeGraph: request.includeGraph,
                        includeArchitectureMemory: request.includeArchitectureMemory
                    },
                    semanticCandidates
                });

                let engineeringPlan: any = undefined;
                let executionSchedule: any = undefined;
                let executionDiagnostics: any = undefined;

                if (plan.intent !== "analysis") {
                    const engPlannerStart = Date.now();
                    const { EngineeringPlannerService } = await import("../engineering-planner");
                    const engPlanner = new EngineeringPlannerService(this.projectRoot, this.workspaceRoot);
                    engineeringPlan = await engPlanner.plan({
                        query: request.query,
                        intent: plan.intent,
                        candidates: fusionResult.candidates
                    });
                    planningTimeMs += Date.now() - engPlannerStart;

                    const orchestratorStart = Date.now();
                    const { MultiAgentOrchestratorService } = await import("../orchestrator");
                    const orchestrator = new MultiAgentOrchestratorService(this.workspaceRoot);
                    const orchestratorResponse = await orchestrator.orchestrate({
                        plan: engineeringPlan
                    });
                    executionSchedule = orchestratorResponse.schedule;
                    executionDiagnostics = orchestratorResponse.report;
                    planningTimeMs += Date.now() - orchestratorStart;
                }

                const assembleStart = Date.now();
                const assembler = new ContextAssemblerService(this.projectRoot, this.workspaceRoot);

                context = await assembler.assemble(
                    request.query,
                    request.maxTokens,
                    {
                        includeExecution: request.includeExecution,
                        includeRelationships: request.includeRelationships,
                        includeGraph: request.includeGraph,
                        includeArchitectureMemory: request.includeArchitectureMemory,
                        fusedCandidates: fusionResult.candidates,
                        engineeringPlan,
                        executionSchedule,
                        executionDiagnostics,
                        bypassCache: true // query engine already handles caching/invalidation
                    }
                );
                assemblyTimeMs = Date.now() - assembleStart;

            } else {
                retrievedFilesCount = context.files.length;
            }

            const totalTimeMs = Date.now() - totalStart;

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
                    executionSnapshotId: context.executionDiagnostics?.executionSnapshotId
                }
            };

        } catch (error: any) {

            return this.createErrorResult(request, `Query failed: ${error.message}`, totalStart);

        }

    }

    private createErrorResult(request: QueryRequest, errorMessage: string, startTime: number): QueryResult {

        const totalTimeMs = Date.now() - startTime;

        const emptyContext: ContextPackage = {
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
                error: errorMessage
            }
        };

    }

}
