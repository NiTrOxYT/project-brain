// ──────────────────────────────────────────────────────────────────────────────
// BUILD-054 — Context Compiler — Main Service
// Orchestrates the full compilation pipeline:
//   Collector → Normalizer → DependencyAnalyzer → GraphCompiler
//   → SnapshotBuilder → Optimizer → Validator → Storage/Cache
//
// Design principles:
//   • Deterministic  — same inputs produce byte-identical outputs
//   • Immutable      — snapshots are never mutated after creation
//   • Incremental    — reuses parent snapshot when only deltas exist
//   • Zero AI        — no model calls anywhere in this pipeline
//   • Provider agnostic
// ──────────────────────────────────────────────────────────────────────────────

import EventEmitter from "events";
import {
    SemanticSnapshot,
    SnapshotCompilationRequest,
    SnapshotCompilationResult,
    SnapshotDiagnostics,
    SnapshotStatistics,
    SnapshotReference,
    SnapshotDelta,
    CompilationMetrics,
    CompilationStage,
    SnapshotSection,
    SnapshotFile,
    SnapshotSymbol,
    SnapshotDependency,
    SnapshotRelationship,
    SnapshotGraph
} from "./types.js";
import { SnapshotCompilationError } from "./errors.js";
import { SnapshotCollector } from "./collector.js";
import { SnapshotNormalizer } from "./normalizer.js";
import { DependencyAnalyzer } from "./dependency-analyzer.js";
import { GraphCompiler } from "./graph-compiler.js";
import { SnapshotBuilder } from "./snapshot-builder.js";
import { SnapshotFingerprintEngine } from "./fingerprint.js";
import { SnapshotCache } from "./cache.js";
import { SnapshotDeltaEngine } from "./delta.js";
import { SnapshotOptimizer } from "./optimizer.js";
import { SnapshotValidator } from "./validator.js";
import { SnapshotStorage } from "./storage.js";
import { SnapshotMetricsTracker } from "./metrics.js";
import { SnapshotDiagnosticsBuilder } from "./diagnostics.js";

export class ContextCompilerService {
    /** Global emitter — external systems may listen for 'snapshot-compiled' events. */
    static readonly emitter = new EventEmitter();

    private readonly collector: SnapshotCollector;
    private readonly normalizer = new SnapshotNormalizer();
    private readonly depAnalyzer = new DependencyAnalyzer();
    private readonly graphCompiler = new GraphCompiler();
    private readonly builder = new SnapshotBuilder();
    private readonly fpEngine = new SnapshotFingerprintEngine();
    private readonly cache: SnapshotCache;
    private readonly storage: SnapshotStorage;
    private readonly deltaEngine = new SnapshotDeltaEngine();
    private readonly optimizer = new SnapshotOptimizer();
    private readonly validator = new SnapshotValidator();
    private readonly metrics: SnapshotMetricsTracker;
    private readonly diagBuilder = new SnapshotDiagnosticsBuilder();

    constructor(
        private readonly projectRoot: string,
        private readonly workspaceRoot: string
    ) {
        this.collector = new SnapshotCollector(projectRoot, workspaceRoot);
        this.cache = new SnapshotCache(workspaceRoot);
        this.storage = new SnapshotStorage(workspaceRoot);
        this.metrics = new SnapshotMetricsTracker(workspaceRoot);
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    /**
     * Compile a full snapshot of the current repository state.
     * Returns a cache hit immediately if the fingerprint matches.
     */
    async compile(
        req: SnapshotCompilationRequest = {
            projectRoot: this.projectRoot,
            workspaceRoot: this.workspaceRoot
        }
    ): Promise<SnapshotCompilationResult> {
        const stages: CompilationStage[] = [];
        const compilationStart = Date.now();

        try {
            // Stage 1: Collect
            const context = await this.runStage(stages, "Collector", () =>
                this.collector.collect()
            );

            // Stage 2: Fingerprint
            const fingerprint = await this.runStage(stages, "Fingerprint", () =>
                Promise.resolve(this.fpEngine.compute(context))
            );

            // Cache hit?
            if (!req.force) {
                const hit = await this.cache.get(fingerprint.hash);
                if (hit) {
                    const compilationMetrics: CompilationMetrics = {
                        totalDurationMs: Date.now() - compilationStart,
                        stages,
                        estimatedTokens: hit.metadata.estimatedTokens,
                        fileCount: hit.metadata.fileCount,
                        symbolCount: hit.metadata.symbolCount,
                        dependencyEdgeCount: hit.metadata.dependencyEdgeCount,
                        graphNodeCount: hit.metadata.graphNodeCount,
                        cacheHit: true,
                        incremental: false
                    };
                    await this.metrics.record(compilationMetrics, hit.snapshotId);
                    return { snapshot: hit, metrics: compilationMetrics, cacheHit: true };
                }
            }

            // Stage 3: Normalize files & symbols from context
            const files = await this.runStage(stages, "Normalizer:Files", () =>
                Promise.resolve(this.builder.extractFiles(context))
            );

            const symbols = await this.runStage(stages, "Normalizer:Symbols", () =>
                Promise.resolve(this.builder.extractSymbols(context))
            );

            // Stage 4: Dependency analysis
            const dependencies = await this.runStage(stages, "DependencyAnalyzer", () =>
                Promise.resolve(this.depAnalyzer.analyze(context))
            );

            // Stage 5: Relationships
            const relationships = await this.runStage(stages, "Relationships", () =>
                Promise.resolve(this.builder.extractRelationships(context))
            );

            // Stage 6: Architecture
            const architecture = await this.runStage(stages, "Architecture", () =>
                Promise.resolve(this.builder.extractArchitecture(context))
            );

            // Stage 7: Evolution
            const evolution = await this.runStage(stages, "Evolution", () =>
                Promise.resolve(this.builder.extractEvolution(context))
            );

            // Stage 8: Learning
            const learning = await this.runStage(stages, "Learning", () =>
                Promise.resolve(this.builder.extractLearning(context))
            );

            // Stage 9: Graph Compilation
            const graph = await this.runStage(stages, "GraphCompiler", () =>
                Promise.resolve(this.graphCompiler.compile(context, dependencies))
            );

            // Stage 10: Snapshot Assembly
            const compilationDurationMs = Date.now() - compilationStart;

            // Determine if incremental
            let parentSnapshotId: string | undefined;
            let incremental = false;
            if (req.parentSnapshotId) {
                const parent = await this.storage.load(req.parentSnapshotId);
                if (parent) {
                    parentSnapshotId = req.parentSnapshotId;
                    incremental = true;
                }
            } else if (!req.force) {
                const latestRef = await this.storage.latestReference();
                if (latestRef && latestRef.fingerprint.filesystemHash === fingerprint.filesystemHash) {
                    // Same filesystem hash — use parent for incremental reference
                    parentSnapshotId = latestRef.snapshotId;
                    incremental = true;
                }
            }

            const snapshot = await this.runStage(stages, "SnapshotBuilder", () =>
                Promise.resolve(this.builder.build({
                    context,
                    fingerprint,
                    files,
                    symbols,
                    dependencies,
                    relationships,
                    graph,
                    architecture,
                    evolution,
                    learning,
                    compilationDurationMs,
                    stageCount: stages.length,
                    incremental,
                    parentSnapshotId
                }))
            );

            // Stage 11: Optimize
            const optimizerResult = await this.runStage(stages, "Optimizer", () =>
                Promise.resolve(this.optimizer.optimize(snapshot))
            );

            // Rebuild snapshot with optimized sections
            const optimizedSnapshot: SemanticSnapshot = {
                ...snapshot,
                sections: optimizerResult.sections,
                metadata: {
                    ...snapshot.metadata,
                    estimatedTokens: optimizerResult.sections.reduce(
                        (acc, s) => acc + s.estimatedTokens, 0
                    ),
                    stageCount: stages.length
                }
            };

            if (optimizerResult.tokensSaved > 0) {
                await this.metrics.recordTokenSavings(optimizerResult.tokensSaved);
            }

            // Stage 12: Validate
            const validation = await this.runStage(stages, "Validator", () =>
                Promise.resolve(this.validator.validate(optimizedSnapshot))
            );

            // Stage 13: Store
            await this.runStage(stages, "Storage", async () => {
                await this.storage.save(optimizedSnapshot);
                await this.cache.put(optimizedSnapshot);
            });

            const finalMetrics: CompilationMetrics = {
                totalDurationMs: Date.now() - compilationStart,
                stages,
                estimatedTokens: optimizedSnapshot.metadata.estimatedTokens,
                fileCount: files.length,
                symbolCount: symbols.length,
                dependencyEdgeCount: dependencies.length,
                graphNodeCount: graph.nodes.length,
                cacheHit: false,
                incremental
            };

            // Compute delta if incremental
            let delta: SnapshotDelta | undefined;
            if (incremental && parentSnapshotId) {
                const parent = await this.storage.load(parentSnapshotId);
                if (parent) {
                    delta = this.deltaEngine.compute(parent, optimizedSnapshot);
                    finalMetrics.tokenDelta = delta.tokenDelta;
                }
            }

            await this.metrics.record(finalMetrics, optimizedSnapshot.snapshotId);

            // Emit event for external subscribers (e.g., autonomous-runtime)
            ContextCompilerService.emitter.emit("snapshot-compiled", {
                snapshotId: optimizedSnapshot.snapshotId,
                metrics: finalMetrics,
                delta
            });

            return {
                snapshot: optimizedSnapshot,
                metrics: finalMetrics,
                delta,
                cacheHit: false
            };
        } catch (err: any) {
            throw new SnapshotCompilationError(
                `Compilation failed: ${err.message}`
            );
        }
    }

    /**
     * Compile incrementally — only reprocesses changed files.
     * If no parent exists or changes require full recompile, falls back to full compile.
     */
    async compileIncremental(
        changedFilePaths?: string[]
    ): Promise<SnapshotCompilationResult> {
        const latestRef = await this.storage.latestReference();
        return this.compile({
            projectRoot: this.projectRoot,
            workspaceRoot: this.workspaceRoot,
            parentSnapshotId: latestRef?.snapshotId,
            filePaths: changedFilePaths,
            force: false
        });
    }

    /**
     * Load the latest compiled snapshot without recompiling.
     */
    async latest(): Promise<SemanticSnapshot | null> {
        return this.storage.latest();
    }

    /**
     * Load a specific snapshot by ID.
     */
    async load(snapshotId: string): Promise<SemanticSnapshot | null> {
        return this.storage.load(snapshotId);
    }

    /**
     * List all stored snapshot references.
     */
    async list(): Promise<SnapshotReference[]> {
        return this.storage.list();
    }

    /**
     * Delete a specific snapshot.
     */
    async delete(snapshotId: string): Promise<void> {
        await this.storage.delete(snapshotId);
        await this.cache.evict(snapshotId);
    }

    /**
     * Compact old snapshots — keep only the N most recent.
     */
    async compact(keepCount: number = 10): Promise<number> {
        return this.storage.compact(keepCount);
    }

    /**
     * Compute a delta between two snapshots.
     */
    async delta(fromId: string, toId: string): Promise<SnapshotDelta | null> {
        const [from, to] = await Promise.all([
            this.storage.load(fromId),
            this.storage.load(toId)
        ]);
        if (!from || !to) return null;
        return this.deltaEngine.compute(from, to);
    }

    /**
     * Get lifetime compilation statistics.
     */
    async statistics(): Promise<SnapshotStatistics> {
        return this.metrics.get();
    }

    /**
     * Build full diagnostics for the latest snapshot.
     */
    async diagnostics(): Promise<SnapshotDiagnostics | null> {
        const snapshot = await this.latest();
        if (!snapshot) return null;

        const validation = this.validator.validate(snapshot);
        const stats = await this.metrics.get();

        return this.diagBuilder.build({
            snapshot,
            metrics: {
                totalDurationMs: snapshot.metadata.compilationDurationMs,
                stages: [],
                estimatedTokens: snapshot.metadata.estimatedTokens,
                fileCount: snapshot.metadata.fileCount,
                symbolCount: snapshot.metadata.symbolCount,
                dependencyEdgeCount: snapshot.metadata.dependencyEdgeCount,
                graphNodeCount: snapshot.metadata.graphNodeCount,
                cacheHit: false,
                incremental: snapshot.metadata.incremental
            },
            validation,
            statistics: stats
        });
    }

    /**
     * Compile dirty files only.
     */
    async compileDirty(dirtyFiles: string[]): Promise<SnapshotCompilationResult> {
        return this.compile({
            projectRoot: this.projectRoot,
            workspaceRoot: this.workspaceRoot,
            filePaths: dirtyFiles,
            force: false
        });
    }

    /**
     * Compile a single SnapshotSection.
     */
    compileSection(
        sectionId: string,
        name: string,
        kind: SnapshotSection["kind"],
        priority: number,
        data: any,
        sourcePaths: string[]
    ): SnapshotSection {
        const content = JSON.stringify(data);
        const estimatedTokens = Math.ceil(content.length / 4);
        const contentHash = this.fpEngine.hashContent(content);
        return {
            id: sectionId,
            name,
            kind,
            content,
            priority,
            contentHash,
            estimatedTokens,
            sourcePaths
        };
    }

    /**
     * Extract SnapshotFiles for specified dirty files.
     */
    async compileChangedFiles(dirtyFiles: string[]): Promise<SnapshotFile[]> {
        const context = await this.collector.collect();
        context.filePaths = dirtyFiles;
        return this.builder.extractFiles(context);
    }

    /**
     * Extract SnapshotSymbols for specified dirty files.
     */
    async compileDirtySymbols(dirtyFiles: string[]): Promise<SnapshotSymbol[]> {
        const context = await this.collector.collect();
        const allSymbols = this.builder.extractSymbols(context);
        return allSymbols.filter(s => dirtyFiles.includes(s.filePath));
    }

    /**
     * Extract SnapshotDependencies for specified dirty files.
     */
    async compileDirtyDeps(dirtyFiles: string[]): Promise<SnapshotDependency[]> {
        const context = await this.collector.collect();
        const allDeps = this.depAnalyzer.analyze(context);
        return allDeps.filter(d => dirtyFiles.includes(d.fromPath) || dirtyFiles.includes(d.toPath));
    }

    /**
     * Extract SnapshotRelationships for specified dirty files.
     */
    async compileDirtyRels(dirtyFiles: string[]): Promise<SnapshotRelationship[]> {
        const context = await this.collector.collect();
        const allRels = this.builder.extractRelationships(context);
        return allRels.filter(r => dirtyFiles.includes(r.subject) || dirtyFiles.includes(r.object));
    }

    /**
     * Compile SnapshotGraph for specified dirty files.
     */
    async compileDirtyGraph(dirtyFiles: string[]): Promise<SnapshotGraph> {
        const context = await this.collector.collect();
        const deps = await this.compileDirtyDeps(dirtyFiles);
        return this.graphCompiler.compile(context, deps);
    }

    /**
     * Compile/apply a patch to target snapshot.
     */
    async compilePatch(
        prevSnapshotId: string,
        patch: any
    ): Promise<SemanticSnapshot> {
        const prev = await this.load(prevSnapshotId);
        if (!prev) throw new Error(`Parent snapshot ${prevSnapshotId} not found`);
        const { PatchApplier } = await import("../context-sync/patch-applier.js");
        const applier = new PatchApplier();
        return applier.apply(prev, patch);
    }

    /**
     * Validate a snapshot without compiling a new one.
     */
    async validate(snapshotId: string): Promise<import("./types.js").SnapshotValidationResult | null> {
        const snapshot = await this.storage.load(snapshotId);
        if (!snapshot) return null;
        return this.validator.validate(snapshot);
    }

    // ─── Internal Stage Runner ───────────────────────────────────────────────

    private async runStage<T>(
        stages: CompilationStage[],
        name: string,
        fn: () => Promise<T>
    ): Promise<T> {
        const startedAt = Date.now();
        try {
            const result = await fn();
            const completedAt = Date.now();
            stages.push({
                name,
                startedAt,
                completedAt,
                durationMs: completedAt - startedAt,
                inputSizeBytes: 0,
                outputSizeBytes: 0,
                success: true
            });
            return result;
        } catch (err: any) {
            const completedAt = Date.now();
            stages.push({
                name,
                startedAt,
                completedAt,
                durationMs: completedAt - startedAt,
                inputSizeBytes: 0,
                outputSizeBytes: 0,
                success: false,
                error: err.message
            });
            throw err;
        }
    }
}
