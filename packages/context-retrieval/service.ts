import crypto from "crypto";
import path from "path";
import { ContextCompilerService } from "../context-compiler/service.js";
import { ContextSynchronizationService } from "../context-sync/service.js";
import {
    RetrievalRequest,
    RetrievalResult,
    RetrievalPackage,
    RetrievalSection,
    RetrievalMetrics,
    RetrievalStatistics,
    RetrievalDiagnostics,
    RetrievalStrategy
} from "./types.js";
import { QueryParser } from "./query-parser.js";
import { RetrievalPlanner } from "./retrieval-planner.js";
import { GraphTraverser } from "./graph-traverser.js";
import { DependencyExpander } from "./dependency-expander.js";
import { SymbolRetriever } from "./symbol-retriever.js";
import { RelationshipRetriever } from "./relationship-retriever.js";
import { ArchitectureRetriever } from "./architecture-retriever.js";
import { LearningRetriever } from "./learning-retriever.js";
import { RetrievalRanker } from "./ranking.js";
import { RetrievalBudgeter } from "./budget.js";
import { RetrievalCompressor } from "./compressor.js";
import { RetrievalCache } from "./cache.js";
import { RetrievalValidator } from "./validator.js";
import { RetrievalMetricsTracker } from "./metrics.js";
import { RetrievalDiagnosticsBuilder } from "./diagnostics.js";
import { SemanticSnapshot, SnapshotSection, CompilationStage } from "../context-compiler/types.js";

export class ContextRetrievalService {
    private readonly syncService: ContextSynchronizationService;
    private readonly compiler: ContextCompilerService;
    private readonly parser = new QueryParser();
    private readonly planner = new RetrievalPlanner();
    private readonly traverser = new GraphTraverser();
    private readonly expander = new DependencyExpander();
    private readonly symbolRetriever = new SymbolRetriever();
    private readonly relationshipRetriever = new RelationshipRetriever();
    private readonly architectureRetriever = new ArchitectureRetriever();
    private readonly learningRetriever = new LearningRetriever();
    private readonly ranker = new RetrievalRanker();
    private readonly budgeter = new RetrievalBudgeter();
    private readonly compressor = new RetrievalCompressor();
    private readonly cache: RetrievalCache;
    private readonly validator = new RetrievalValidator();
    private readonly metricsTracker: RetrievalMetricsTracker;
    private readonly diagBuilder = new RetrievalDiagnosticsBuilder();

    private readonly projectRoot: string;
    private readonly workspaceRoot: string;

    constructor(
        projectRoot: string,
        workspaceRoot: string
    ) {
        this.projectRoot = projectRoot;
        this.workspaceRoot = workspaceRoot.endsWith(".brain") ? workspaceRoot : path.join(workspaceRoot, ".brain");
        this.syncService = new ContextSynchronizationService(this.projectRoot, this.workspaceRoot);
        this.compiler = new ContextCompilerService(this.projectRoot, this.workspaceRoot);
        this.cache = new RetrievalCache(this.workspaceRoot);
        this.metricsTracker = new RetrievalMetricsTracker(this.workspaceRoot);
    }

    async retrieve(req: RetrievalRequest): Promise<RetrievalResult> {
        const start = Date.now();
        const stages: { name: string; durationMs: number; success: boolean }[] = [];

        // Load Snapshot
        const loadStart = Date.now();
        let snapshot = req.snapshotId && req.snapshotId !== "latest"
            ? await this.syncService.loadSnapshot(req.snapshotId)
            : await this.syncService.latestSnapshot();
        if (!snapshot) {
            // Rebuild fully if missing
            const comp = await this.compiler.compile({
                projectRoot: this.projectRoot,
                workspaceRoot: this.workspaceRoot,
                force: true
            });
            snapshot = comp.snapshot;
        }
        stages.push({
            name: "LoadSnapshot",
            durationMs: Date.now() - loadStart,
            success: true
        });

        // Query parsing
        const parseStart = Date.now();
        const parsed = this.parser.parse(req.query);
        stages.push({
            name: "ParseQuery",
            durationMs: Date.now() - parseStart,
            success: true
        });

        // Cache hit?
        if (req.useCache !== false) {
            const hit = await this.cache.get(snapshot.snapshotId, req.query);
            if (hit) {
                const duration = Date.now() - start;
                const metrics: RetrievalMetrics = {
                    retrievalDurationMs: duration,
                    stages,
                    expansionCount: 0,
                    compressionRatio: 1.0,
                    retrievedFilesCount: hit.candidates.length,
                    retrievedSymbolsCount: hit.symbols.length,
                    retrievedEdgesCount: hit.graph.edges.length,
                    retrievedRulesCount: 0,
                    tokenEstimate: hit.sections.reduce((acc, s) => acc + s.estimatedTokens, 0)
                };
                await this.metricsTracker.record(metrics, true);
                return {
                    retrievalPackage: hit,
                    metrics,
                    cacheHit: true
                };
            }
        }

        // Planning
        const plan = this.planner.plan(parsed, req.strategy, req.expansionDepth);

        // Dependency Expansion
        const expStart = Date.now();
        const expandedFiles = this.expander.expand(
            snapshot,
            parsed.targetFiles,
            plan.expansionDepth
        );
        stages.push({
            name: "ExpandDependencies",
            durationMs: Date.now() - expStart,
            success: true
        });

        // Symbol Retrieval
        const symStart = Date.now();
        const symbols = this.symbolRetriever.retrieve(
            snapshot,
            parsed.targetSymbols,
            expandedFiles
        );
        stages.push({
            name: "RetrieveSymbols",
            durationMs: Date.now() - symStart,
            success: true
        });

        // Relationship Retrieval
        const relStart = Date.now();
        const relationships = this.relationshipRetriever.retrieve(
            snapshot,
            expandedFiles
        );
        stages.push({
            name: "RetrieveRelationships",
            durationMs: Date.now() - relStart,
            success: true
        });

        // Architecture Retrieval
        const archStart = Date.now();
        const architecture = this.architectureRetriever.retrieve(
            snapshot,
            parsed.keywords
        );
        stages.push({
            name: "RetrieveArchitecture",
            durationMs: Date.now() - archStart,
            success: true
        });

        // Learning Retrieval
        const learnStart = Date.now();
        const learning = this.learningRetriever.retrieve(
            snapshot,
            parsed.intent,
            expandedFiles
        );
        stages.push({
            name: "RetrieveLearning",
            durationMs: Date.now() - learnStart,
            success: true
        });

        // Graph Traversal
        const graphStart = Date.now();
        const startNodes = parsed.targetFiles.map(f => `file::${f}`);
        const graph = this.traverser.traverseBFS(snapshot, startNodes, plan.expansionDepth);
        stages.push({
            name: "TraverseGraph",
            durationMs: Date.now() - graphStart,
            success: true
        });

        // Ranking — when no specific files were targeted, seed with top snapshot files
        // so ranking always produces a meaningful ordered candidate list.
        const rankStart = Date.now();
        const filesToRank = expandedFiles.length > 0
            ? expandedFiles
            : snapshot.files.slice(0, 50).map(f => f.path);
        const candidates = this.ranker.rank(
            snapshot,
            filesToRank,
            parsed.targetFiles,
            parsed.targetSymbols,
            learning
        );
        stages.push({
            name: "Rank",
            durationMs: Date.now() - rankStart,
            success: true
        });


        // Build unbudgeted package sections
        const rawSections: RetrievalSection[] = [];
        const originalTokens = snapshot.metadata.estimatedTokens;

        // Extract and map matching sections from snapshot.
        // Core sections are ALWAYS included — they contain the primary workspace context.
        // Conditional sections are included when their specific retrieval produced results.
        for (const sec of snapshot.sections) {
            let matches = false;
            let reason: RetrievalSection["reason"] = "system-config";

            if (sec.id === "filesystem-index") {
                matches = true;
                reason = "system-config";
            } else if (sec.id === "symbol-index") {
                // Always include — symbol index is always relevant context
                matches = true;
                reason = symbols.length > 0 ? "primary-target" : "system-config";
            } else if (sec.id === "architecture-memory") {
                // Always include — architecture is always relevant context
                matches = true;
                reason = architecture.length > 0 ? "architecture" : "system-config";
            } else if (sec.id === "learning-summary" && learning.length > 0) {
                matches = true;
                reason = "learning-experience";
            } else if (sec.id === "knowledge-graph" || sec.id === "dependency-graph") {
                matches = true;
                reason = "relationship-link";
            } else if (sec.id === "execution-graph") {
                matches = true;
                reason = "graph-context";
            } else if (sec.id === "repository-evolution") {
                matches = true;
                reason = "evolution-history";
            }

            if (matches) {
                rawSections.push({
                    id: sec.id,
                    name: sec.name,
                    kind: sec.kind,
                    content: sec.content,
                    priority: sec.priority,
                    estimatedTokens: sec.estimatedTokens,
                    reason
                });
            }
        }


        // Budgeting
        const budgetStart = Date.now();
        const { allocatedSections, budget } = this.budgeter.allocate(
            rawSections,
            req.providerId,
            req.maxTokens
        );
        stages.push({
            name: "Budget",
            durationMs: Date.now() - budgetStart,
            success: true
        });

        // Uncompressed Package
        const uncompressedPkg: RetrievalPackage = {
            retrievalId: `retrieval-${crypto.randomBytes(6).toString("hex")}`,
            snapshotId: snapshot.snapshotId,
            sections: allocatedSections,
            candidates,
            graph,
            symbols,
            dependencies: snapshot.dependencies.filter(d =>
                expandedFiles.includes(d.fromPath) || expandedFiles.includes(d.toPath)
            ),
            relationships
        };

        // Compression
        const compressStart = Date.now();
        const compressedPkg = this.compressor.compress(uncompressedPkg);
        stages.push({
            name: "Compress",
            durationMs: Date.now() - compressStart,
            success: true
        });

        // Validation
        const valStart = Date.now();
        const validation = this.validator.validate(compressedPkg, budget.maxTokens);
        stages.push({
            name: "Validate",
            durationMs: Date.now() - valStart,
            success: validation.valid
        });

        const duration = Date.now() - start;
        const finalTokens = compressedPkg.sections.reduce((acc, s) => acc + s.estimatedTokens, 0);

        const metrics: RetrievalMetrics = {
            retrievalDurationMs: duration,
            stages,
            expansionCount: expandedFiles.length,
            compressionRatio: originalTokens > 0 ? finalTokens / originalTokens : 1.0,
            retrievedFilesCount: candidates.length,
            retrievedSymbolsCount: symbols.length,
            retrievedEdgesCount: graph.edges.length,
            retrievedRulesCount: architecture.length,
            tokenEstimate: finalTokens
        };

        // Persist to cache
        await this.cache.put(snapshot.snapshotId, req.query, compressedPkg);
        await this.metricsTracker.record(metrics, false);

        return {
            retrievalPackage: compressedPkg,
            metrics,
            cacheHit: false
        };
    }

    async retrieveFiles(query: string, strategy?: RetrievalStrategy): Promise<string[]> {
        const res = await this.retrieve({ query, strategy, useCache: false });
        return res.retrievalPackage.candidates.map(c => c.path);
    }

    async retrieveSymbols(query: string): Promise<any[]> {
        const res = await this.retrieve({ query, useCache: false });
        return res.retrievalPackage.symbols;
    }

    async retrieveArchitecture(query: string): Promise<any[]> {
        const res = await this.retrieve({ query, useCache: false });
        // Retrieve architecture entries via filter
        const snapshot = await this.syncService.latestSnapshot();
        if (!snapshot) return [];
        return this.architectureRetriever.retrieve(snapshot, this.parser.parse(query).keywords);
    }

    async retrieveLearning(query: string): Promise<any[]> {
        const res = await this.retrieve({ query, useCache: false });
        return res.retrievalPackage.sections.filter(s => s.kind === "learning-summary");
    }

    expand(snapshot: SemanticSnapshot, filePaths: string[], maxDepth?: number): string[] {
        return this.expander.expand(snapshot, filePaths, maxDepth);
    }

    compress(pkg: RetrievalPackage): RetrievalPackage {
        return this.compressor.compress(pkg);
    }

    validate(pkg: RetrievalPackage, budgetLimit?: number): any {
        return this.validator.validate(pkg, budgetLimit);
    }

    statistics(): Promise<RetrievalStatistics> {
        return this.metricsTracker.get();
    }

    async latestSnapshot() {
        return this.syncService.latestSnapshot();
    }
}
