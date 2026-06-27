import crypto from "crypto";
import { ContextCompilerService } from "../context-compiler/service.js";
import { ContextSynchronizationService } from "../context-sync/service.js";
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
export class ContextRetrievalService {
    projectRoot;
    workspaceRoot;
    syncService;
    compiler;
    parser = new QueryParser();
    planner = new RetrievalPlanner();
    traverser = new GraphTraverser();
    expander = new DependencyExpander();
    symbolRetriever = new SymbolRetriever();
    relationshipRetriever = new RelationshipRetriever();
    architectureRetriever = new ArchitectureRetriever();
    learningRetriever = new LearningRetriever();
    ranker = new RetrievalRanker();
    budgeter = new RetrievalBudgeter();
    compressor = new RetrievalCompressor();
    cache;
    validator = new RetrievalValidator();
    metricsTracker;
    diagBuilder = new RetrievalDiagnosticsBuilder();
    constructor(projectRoot, workspaceRoot) {
        this.projectRoot = projectRoot;
        this.workspaceRoot = workspaceRoot;
        this.syncService = new ContextSynchronizationService(projectRoot, workspaceRoot);
        this.compiler = new ContextCompilerService(projectRoot, workspaceRoot);
        this.cache = new RetrievalCache(workspaceRoot);
        this.metricsTracker = new RetrievalMetricsTracker(workspaceRoot);
    }
    async retrieve(req) {
        const start = Date.now();
        const stages = [];
        // Load Snapshot
        const loadStart = Date.now();
        let snapshot = await this.syncService.latestSnapshot();
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
                const metrics = {
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
        const expandedFiles = this.expander.expand(snapshot, parsed.targetFiles, plan.expansionDepth);
        stages.push({
            name: "ExpandDependencies",
            durationMs: Date.now() - expStart,
            success: true
        });
        // Symbol Retrieval
        const symStart = Date.now();
        const symbols = this.symbolRetriever.retrieve(snapshot, parsed.targetSymbols, expandedFiles);
        stages.push({
            name: "RetrieveSymbols",
            durationMs: Date.now() - symStart,
            success: true
        });
        // Relationship Retrieval
        const relStart = Date.now();
        const relationships = this.relationshipRetriever.retrieve(snapshot, expandedFiles);
        stages.push({
            name: "RetrieveRelationships",
            durationMs: Date.now() - relStart,
            success: true
        });
        // Architecture Retrieval
        const archStart = Date.now();
        const architecture = this.architectureRetriever.retrieve(snapshot, parsed.keywords);
        stages.push({
            name: "RetrieveArchitecture",
            durationMs: Date.now() - archStart,
            success: true
        });
        // Learning Retrieval
        const learnStart = Date.now();
        const learning = this.learningRetriever.retrieve(snapshot, parsed.intent, expandedFiles);
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
        // Ranking
        const rankStart = Date.now();
        const candidates = this.ranker.rank(snapshot, expandedFiles, parsed.targetFiles, parsed.targetSymbols, learning);
        stages.push({
            name: "Rank",
            durationMs: Date.now() - rankStart,
            success: true
        });
        // Build unbudgeted package sections
        const rawSections = [];
        const originalTokens = snapshot.metadata.estimatedTokens;
        // Extract and map matching sections from snapshot
        for (const sec of snapshot.sections) {
            let matches = false;
            let reason = "system-config";
            if (sec.id === "filesystem-index") {
                matches = true;
                reason = "system-config";
            }
            else if (sec.id === "symbol-index" && symbols.length > 0) {
                matches = true;
                reason = "primary-target";
            }
            else if (sec.id === "architecture-memory" && architecture.length > 0) {
                matches = true;
                reason = "architecture";
            }
            else if (sec.id === "learning-summary" && learning.length > 0) {
                matches = true;
                reason = "learning-experience";
            }
            else if (sec.id === "knowledge-graph" || sec.id === "dependency-graph") {
                matches = true;
                reason = "relationship-link";
            }
            else if (sec.id === "execution-graph") {
                matches = true;
                reason = "graph-context";
            }
            else if (sec.id === "repository-evolution") {
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
        const { allocatedSections, budget } = this.budgeter.allocate(rawSections, req.providerId, req.maxTokens);
        stages.push({
            name: "Budget",
            durationMs: Date.now() - budgetStart,
            success: true
        });
        // Uncompressed Package
        const uncompressedPkg = {
            retrievalId: `retrieval-${crypto.randomBytes(6).toString("hex")}`,
            snapshotId: snapshot.snapshotId,
            sections: allocatedSections,
            candidates,
            graph,
            symbols,
            dependencies: snapshot.dependencies.filter(d => expandedFiles.includes(d.fromPath) || expandedFiles.includes(d.toPath)),
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
        const metrics = {
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
    async retrieveFiles(query, strategy) {
        const res = await this.retrieve({ query, strategy, useCache: false });
        return res.retrievalPackage.candidates.map(c => c.path);
    }
    async retrieveSymbols(query) {
        const res = await this.retrieve({ query, useCache: false });
        return res.retrievalPackage.symbols;
    }
    async retrieveArchitecture(query) {
        const res = await this.retrieve({ query, useCache: false });
        // Retrieve architecture entries via filter
        const snapshot = await this.syncService.latestSnapshot();
        if (!snapshot)
            return [];
        return this.architectureRetriever.retrieve(snapshot, this.parser.parse(query).keywords);
    }
    async retrieveLearning(query) {
        const res = await this.retrieve({ query, useCache: false });
        return res.retrievalPackage.sections.filter(s => s.kind === "learning-summary");
    }
    expand(snapshot, filePaths, maxDepth) {
        return this.expander.expand(snapshot, filePaths, maxDepth);
    }
    compress(pkg) {
        return this.compressor.compress(pkg);
    }
    validate(pkg, budgetLimit) {
        return this.validator.validate(pkg, budgetLimit);
    }
    statistics() {
        return this.metricsTracker.get();
    }
}
