export class PromptDiagnosticsTracker {
    create(params) {
        const ratio = params.originalSize > 0 ? params.optimizedSize / params.originalSize : 1.0;
        return {
            assemblyDurationMs: params.assemblyDurationMs,
            originalSize: params.originalSize,
            optimizedSize: params.optimizedSize,
            compressionRatio: Number(ratio.toFixed(4)),
            tokenBudget: params.tokenBudget,
            optimizationsApplied: params.optimizationsApplied,
            stages: params.stages
        };
    }
}
