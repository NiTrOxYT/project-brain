// ──────────────────────────────────────────────────────────────────────────────
// BUILD-054 — Context Compiler — Diagnostics
// Builds human-readable diagnostic reports for a compilation run.
// ──────────────────────────────────────────────────────────────────────────────
export class SnapshotDiagnosticsBuilder {
    build(params) {
        return {
            snapshotId: params.snapshot.snapshotId,
            metrics: params.metrics,
            validation: params.validation,
            statistics: params.statistics,
            stageBreakdown: params.metrics.stages
        };
    }
    format(diag) {
        const lines = [];
        lines.push(`=== Context Compiler Diagnostics ===`);
        lines.push(`Snapshot ID   : ${diag.snapshotId}`);
        lines.push(`Cache Hit     : ${diag.metrics.cacheHit}`);
        lines.push(`Incremental   : ${diag.metrics.incremental}`);
        lines.push(`Duration (ms) : ${diag.metrics.totalDurationMs}`);
        lines.push(`Est. Tokens   : ${diag.metrics.estimatedTokens}`);
        lines.push(`Files         : ${diag.metrics.fileCount}`);
        lines.push(`Symbols       : ${diag.metrics.symbolCount}`);
        lines.push(`Dep. Edges    : ${diag.metrics.dependencyEdgeCount}`);
        lines.push(`Graph Nodes   : ${diag.metrics.graphNodeCount}`);
        if (diag.metrics.tokenDelta !== undefined) {
            const sign = diag.metrics.tokenDelta >= 0 ? "+" : "";
            lines.push(`Token Delta   : ${sign}${diag.metrics.tokenDelta}`);
        }
        lines.push(``);
        lines.push(`--- Compilation Stages ---`);
        for (const stage of diag.stageBreakdown) {
            const status = stage.success ? "✓" : "✗";
            lines.push(`  ${status} ${stage.name.padEnd(24)} ${stage.durationMs}ms` +
                (stage.error ? ` [ERROR: ${stage.error}]` : ""));
        }
        lines.push(``);
        lines.push(`--- Validation ---`);
        lines.push(`  Valid         : ${diag.validation.valid}`);
        lines.push(`  Fingerprint   : ${diag.validation.fingerprintValid}`);
        lines.push(`  Sections      : ${diag.validation.sectionsValid}`);
        lines.push(`  Graph         : ${diag.validation.graphValid}`);
        if (diag.validation.errors.length > 0) {
            lines.push(`  Errors:`);
            for (const e of diag.validation.errors) {
                lines.push(`    - ${e}`);
            }
        }
        if (diag.validation.warnings.length > 0) {
            lines.push(`  Warnings:`);
            for (const w of diag.validation.warnings) {
                lines.push(`    - ${w}`);
            }
        }
        lines.push(``);
        lines.push(`--- Lifetime Statistics ---`);
        lines.push(`  Total Snapshots    : ${diag.statistics.totalSnapshots}`);
        lines.push(`  Total Compilations : ${diag.statistics.totalCompilations}`);
        lines.push(`  Cache Hits         : ${diag.statistics.cacheHits}`);
        lines.push(`  Cache Misses       : ${diag.statistics.cacheMisses}`);
        lines.push(`  Incremental        : ${diag.statistics.incrementalCompiles}`);
        lines.push(`  Full Compiles      : ${diag.statistics.fullCompiles}`);
        lines.push(`  Avg Compile (ms)   : ${diag.statistics.averageCompilationMs.toFixed(1)}`);
        lines.push(`  Avg Tokens         : ${diag.statistics.averageTokens.toFixed(0)}`);
        lines.push(`  Token Savings      : ${diag.statistics.tokenSavings}`);
        return lines.join("\n");
    }
}
