import { SynchronizationDiagnostics } from "./types.js";

export class SynchronizationDiagnosticsBuilder {
    build(params: {
        syncId: string;
        metrics: any;
        dirtyFiles: string[];
        affectedModules: string[];
        validationErrors: string[];
        validationWarnings: string[];
    }): SynchronizationDiagnostics {
        const timeline = params.metrics.stages.map((s: any) => ({
            stage: s.name,
            ms: s.durationMs
        }));
        return {
            syncId: params.syncId,
            metrics: params.metrics,
            dirtyFiles: params.dirtyFiles,
            affectedModules: params.affectedModules,
            timeline,
            validationErrors: params.validationErrors,
            validationWarnings: params.validationWarnings
        };
    }

    format(diag: SynchronizationDiagnostics): string {
        const lines: string[] = [];

        lines.push(`=== Synchronization Diagnostics ===`);
        lines.push(`Sync ID          : ${diag.syncId}`);
        lines.push(`Duration (ms)    : ${diag.metrics.totalDurationMs}`);
        lines.push(`Dirty Files      : ${diag.metrics.dirtyFilesCount}`);
        lines.push(`Rebuilt Symbols  : ${diag.metrics.rebuiltSymbolsCount}`);
        lines.push(`Rebuilt Nodes    : ${diag.metrics.rebuiltGraphNodesCount}`);
        lines.push(`Patch Size (bytes): ${diag.metrics.patchSizeBytes}`);
        lines.push(`Rebuild %        : ${diag.metrics.incrementalRebuildPercentage.toFixed(2)}%`);
        lines.push(`Speedup Ratio    : ${diag.metrics.speedupRatio.toFixed(1)}x`);

        lines.push(``);
        lines.push(`--- Dirty Files ---`);
        for (const file of diag.dirtyFiles) {
            lines.push(`  - ${file}`);
        }

        lines.push(``);
        lines.push(`--- Affected Modules ---`);
        for (const mod of diag.affectedModules) {
            lines.push(`  - ${mod}`);
        }

        lines.push(``);
        lines.push(`--- Synchronization Timeline ---`);
        for (const stage of diag.timeline) {
            lines.push(`  ${stage.stage.padEnd(24)} : ${stage.ms}ms`);
        }

        lines.push(``);
        lines.push(`--- Validation ---`);
        lines.push(`  Status : ${diag.validationErrors.length === 0 ? "PASSED" : "FAILED"}`);
        if (diag.validationErrors.length > 0) {
            lines.push(`  Errors:`);
            for (const err of diag.validationErrors) {
                lines.push(`    - ${err}`);
            }
        }
        if (diag.validationWarnings.length > 0) {
            lines.push(`  Warnings:`);
            for (const warn of diag.validationWarnings) {
                lines.push(`    - ${warn}`);
            }
        }

        return lines.join("\n");
    }
}
