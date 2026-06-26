// ──────────────────────────────────────────────────────────────────────────────
// BUILD-051 — Autonomous Execution Loop — Metrics
// ──────────────────────────────────────────────────────────────────────────────
export class ExecutionMetricsService {
    phaseStartTimes = new Map();
    phaseDurations = {};
    startTimestamp = Date.now();
    repairCount = 0;
    retryCount = 0;
    validationCount = 0;
    providerExecutions = 0;
    workspaceTransactions = 0;
    constructor(initialMetrics) {
        if (initialMetrics) {
            this.repairCount = initialMetrics.repairCount;
            this.retryCount = initialMetrics.retryCount;
            this.validationCount = initialMetrics.validationCount;
            this.providerExecutions = initialMetrics.providerExecutions;
            this.workspaceTransactions = initialMetrics.workspaceTransactions;
            this.phaseDurations = { ...initialMetrics.timePerPhase };
        }
    }
    startPhase(phase) {
        this.phaseStartTimes.set(phase, Date.now());
    }
    endPhase(phase) {
        const start = this.phaseStartTimes.get(phase);
        if (start) {
            const elapsed = Date.now() - start;
            this.phaseDurations[phase] = (this.phaseDurations[phase] || 0) + elapsed;
            this.phaseStartTimes.delete(phase);
        }
    }
    incrementRepairs() {
        this.repairCount++;
    }
    incrementRetries() {
        this.retryCount++;
    }
    incrementValidations() {
        this.validationCount++;
    }
    incrementProviderExecutions() {
        this.providerExecutions++;
    }
    incrementWorkspaceTransactions() {
        this.workspaceTransactions++;
    }
    getMetrics(totalTasks, completedCount, failedCount) {
        const totalDurationMs = Date.now() - this.startTimestamp;
        // Flush active phase elapsed time
        const timePerPhase = { ...this.phaseDurations };
        for (const [phase, start] of this.phaseStartTimes.entries()) {
            timePerPhase[phase] = (timePerPhase[phase] || 0) + (Date.now() - start);
        }
        const successRate = totalTasks > 0 ? (completedCount / totalTasks) * 100 : 0;
        const failureRate = totalTasks > 0 ? (failedCount / totalTasks) * 100 : 0;
        return {
            durationMs: totalDurationMs,
            repairCount: this.repairCount,
            retryCount: this.retryCount,
            validationCount: this.validationCount,
            providerExecutions: this.providerExecutions,
            workspaceTransactions: this.workspaceTransactions,
            successRate,
            failureRate,
            timePerPhase
        };
    }
}
