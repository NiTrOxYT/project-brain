import EventEmitter from "events";
import { ContextCompilerService } from "../context-compiler/service.js";
import {
    ContextSyncRequest,
    ContextSyncResult,
    SnapshotPatch,
    IncrementalCompilationMetrics,
    SynchronizationStatistics,
    SynchronizationDiagnostics
} from "./types.js";
import { ChangeDetector } from "./change-detector.js";
import { DependencyResolver } from "./dependency-resolver.js";
import { DirtyRegionTracker } from "./dirty-region.js";
import { PatchBuilder } from "./patch-builder.js";
import { PatchApplier } from "./patch-applier.js";
import { FingerprintUpdater } from "./fingerprint-updater.js";
import { SnapshotValidator } from "./validator.js";
import { SnapshotSyncStorage } from "./storage.js";
import { SynchronizationMetricsTracker } from "./metrics.js";
import { SynchronizationDiagnosticsBuilder } from "./diagnostics.js";
import { WorkspaceListener } from "./workspace-listener.js";
import { SemanticSnapshot, CompilationStage } from "../context-compiler/types.js";

export class ContextSynchronizationService {
    static readonly emitter = new EventEmitter();
    private static cachedLatestSnapshot: SemanticSnapshot | null = null;

    private readonly compiler: ContextCompilerService;
    private readonly changeDetector = new ChangeDetector();
    private readonly depResolver = new DependencyResolver();
    private readonly dirtyTracker = new DirtyRegionTracker();
    private readonly patchBuilder = new PatchBuilder();
    private readonly patchApplier = new PatchApplier();
    private readonly fpUpdater = new FingerprintUpdater();
    private readonly validator = new SnapshotValidator();
    private readonly storage: SnapshotSyncStorage;
    private readonly metricsTracker: SynchronizationMetricsTracker;
    private readonly diagBuilder = new SynchronizationDiagnosticsBuilder();
    private readonly listener: WorkspaceListener;

    constructor(
        private readonly projectRoot: string,
        private readonly workspaceRoot: string
    ) {
        this.compiler = new ContextCompilerService(projectRoot, workspaceRoot);
        this.storage = new SnapshotSyncStorage(workspaceRoot);
        this.metricsTracker = new SynchronizationMetricsTracker(workspaceRoot);
        this.listener = new WorkspaceListener(req => this.sync(req));

        this.listener.start();
    }

    startListening(): void {
        this.listener.start();
    }

    stopListening(): void {
        this.listener.stop();
    }

    destroy(): void {
        this.listener.stop();
    }

    async sync(req: ContextSyncRequest): Promise<ContextSyncResult> {
        const start = Date.now();
        const stages: CompilationStage[] = [];

        // Load latest snapshot
        const latest = await this.runStage(stages, "LoadLatest", () =>
            this.storage.latestSnapshot()
        );

        if (!latest || req.forceFullSync) {
            // Fallback to full compile
            const compStart = Date.now();
            const fullResult = await this.compiler.compile({
                projectRoot: req.projectRoot,
                workspaceRoot: req.workspaceRoot,
                force: true
            });
            const duration = Date.now() - compStart;

            const metrics: IncrementalCompilationMetrics = {
                totalDurationMs: duration,
                stages: fullResult.metrics.stages,
                dirtyFilesCount: fullResult.snapshot.files.length,
                rebuiltSymbolsCount: fullResult.snapshot.symbols.length,
                rebuiltGraphNodesCount: fullResult.snapshot.graph.nodes.length,
                patchSizeBytes: 0,
                speedupRatio: 1.0,
                incrementalRebuildPercentage: 100
            };

            await this.metricsTracker.record(metrics, false);

            ContextSynchronizationService.emitter.emit("SynchronizationCompleted", {
                snapshotId: fullResult.snapshot.snapshotId,
                metrics
            });

            ContextSynchronizationService.cachedLatestSnapshot = fullResult.snapshot;

            return {
                snapshot: fullResult.snapshot,
                metrics,
                cacheHit: false
            };
        }

        // Change Detection
        const changes = await this.runStage(stages, "DetectChanges", () =>
            this.changeDetector.detect(latest, req.changedPaths)
        );

        if (changes.files.length === 0) {
            // No changes detected — return latest snapshot as cache hit
            const duration = Date.now() - start;
            const metrics: IncrementalCompilationMetrics = {
                totalDurationMs: duration,
                stages,
                dirtyFilesCount: 0,
                rebuiltSymbolsCount: 0,
                rebuiltGraphNodesCount: 0,
                patchSizeBytes: 0,
                speedupRatio: 1.0,
                incrementalRebuildPercentage: 0
            };
            return {
                snapshot: latest,
                metrics,
                cacheHit: true
            };
        }

        // Dependency Resolution
        const resolvedDirty = await this.runStage(stages, "ResolveDependencies", () =>
            Promise.resolve(this.depResolver.resolve(latest, changes.files.map(f => f.path)))
        );

        // Compute Dirty Region
        const dirtyRegion = await this.runStage(stages, "ComputeDirty", () =>
            Promise.resolve(this.dirtyTracker.compute(latest, resolvedDirty))
        );

        // Dirty Compilation — compile only dirty components using context compiler partials
        const partialCompileStart = Date.now();
        const dirtyFiles = await this.compiler.compileChangedFiles(dirtyRegion.dirtyFiles);
        const compiledSymbols = await this.compiler.compileDirtySymbols(dirtyRegion.dirtyFiles);
        const compiledDeps = await this.compiler.compileDirtyDeps(dirtyRegion.dirtyFiles);
        const compiledRels = await this.compiler.compileDirtyRels(dirtyRegion.dirtyFiles);
        const compiledGraph = await this.compiler.compileDirtyGraph(dirtyRegion.dirtyFiles);

        stages.push({
            name: "DirtyCompilation",
            startedAt: partialCompileStart,
            completedAt: Date.now(),
            durationMs: Date.now() - partialCompileStart,
            inputSizeBytes: 0,
            outputSizeBytes: 0,
            success: true
        });

        // Patch Building
        const patch = await this.runStage(stages, "BuildPatch", () =>
            Promise.resolve(this.patchBuilder.build({
                prev: latest,
                files: dirtyFiles,
                symbols: compiledSymbols,
                dependencies: compiledDeps,
                relationships: compiledRels,
                graph: compiledGraph,
                transactionId: req.transactionId
            }))
        );

        // Patch Application
        const updatedSnapshot = await this.runStage(stages, "ApplyPatch", () =>
            Promise.resolve(this.patchApplier.apply(latest, patch))
        );

        // Update Fingerprints
        const updatedFp = await this.runStage(stages, "UpdateFingerprints", () =>
            Promise.resolve(this.fpUpdater.update(latest.metadata.fingerprint, updatedSnapshot.sections))
        );

        updatedSnapshot.snapshotId = updatedFp.hash;
        updatedSnapshot.metadata.fingerprint = updatedFp;
        updatedSnapshot.metadata.snapshotId = updatedFp.hash;

        // Validation
        const validation = await this.runStage(stages, "Validate", () =>
            Promise.resolve(this.validator.validate(updatedSnapshot))
        );

        if (!validation.valid) {
            // If validation failed, fallback to full compile
            return this.sync({ ...req, forceFullSync: true });
        }

        // Persist
        await this.runStage(stages, "Store", async () => {
            await this.storage.saveSnapshot(updatedSnapshot);
            await this.storage.savePatch(patch);
        });

        const totalDuration = Date.now() - start;
        const speedupRatio = latest.metadata.compilationDurationMs / Math.max(1, totalDuration);
        const incrementalRebuildPercentage = (dirtyRegion.dirtyFiles.length / Math.max(1, latest.files.length)) * 100;

        const finalMetrics: IncrementalCompilationMetrics = {
            totalDurationMs: totalDuration,
            stages,
            dirtyFilesCount: dirtyRegion.dirtyFiles.length,
            rebuiltSymbolsCount: dirtyRegion.dirtySymbols.length,
            rebuiltGraphNodesCount: dirtyRegion.dirtyGraphNodes.length,
            patchSizeBytes: JSON.stringify(patch).length,
            speedupRatio,
            incrementalRebuildPercentage
        };

        await this.metricsTracker.record(finalMetrics, false);

        ContextSynchronizationService.emitter.emit("SynchronizationCompleted", {
            snapshotId: updatedSnapshot.snapshotId,
            metrics: finalMetrics
        });

        ContextSynchronizationService.cachedLatestSnapshot = updatedSnapshot;

        return {
            snapshot: updatedSnapshot,
            patch,
            metrics: finalMetrics,
            cacheHit: false
        };
    }

    async syncIncremental(changedPaths?: string[]): Promise<ContextSyncResult> {
        return this.sync({
            projectRoot: this.projectRoot,
            workspaceRoot: this.workspaceRoot,
            changedPaths
        });
    }

    async syncFull(): Promise<ContextSyncResult> {
        return this.sync({
            projectRoot: this.projectRoot,
            workspaceRoot: this.workspaceRoot,
            forceFullSync: true
        });
    }

    async applyPatch(prev: SemanticSnapshot, patch: SnapshotPatch): Promise<SemanticSnapshot> {
        return this.patchApplier.apply(prev, patch);
    }

    async rollback(targetSnapshotId: string): Promise<SemanticSnapshot> {
        const snap = await this.storage.rollback(targetSnapshotId);
        ContextSynchronizationService.cachedLatestSnapshot = snap;
        return snap;
    }

    async validate(snapshotId: string): Promise<any> {
        const snap = await this.storage.loadSnapshot(snapshotId);
        if (!snap) return null;
        return this.validator.validate(snap);
    }

    async statistics(): Promise<SynchronizationStatistics> {
        return this.metricsTracker.get();
    }

    async diagnostics(syncId: string, metrics: any, dirtyFiles: string[], affectedModules: string[]): Promise<SynchronizationDiagnostics> {
        return this.diagBuilder.build({
            syncId,
            metrics,
            dirtyFiles,
            affectedModules,
            validationErrors: [],
            validationWarnings: []
        });
    }

    async latestSnapshot(): Promise<SemanticSnapshot | null> {
        if (ContextSynchronizationService.cachedLatestSnapshot) {
            return ContextSynchronizationService.cachedLatestSnapshot;
        }
        const snap = await this.storage.latestSnapshot();
        ContextSynchronizationService.cachedLatestSnapshot = snap;
        return snap;
    }

    subscribe(callback: (val: any) => void): void {
        ContextSynchronizationService.emitter.on("SynchronizationCompleted", callback);
    }

    unsubscribe(callback: (val: any) => void): void {
        ContextSynchronizationService.emitter.off("SynchronizationCompleted", callback);
    }

    // ─── Internal ────────────────────────────────────────────────────────────

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
