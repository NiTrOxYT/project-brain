// ──────────────────────────────────────────────────────────────────────────────
// BUILD-051 — Autonomous Execution Loop — Metrics
// ──────────────────────────────────────────────────────────────────────────────

import { LoopMetrics, ExecutionPhase } from "./types.js";

export class ExecutionMetricsService {
    private readonly phaseStartTimes = new Map<ExecutionPhase, number>();
    private readonly phaseDurations: Record<string, number> = {};

    private startTimestamp = Date.now();
    private repairCount = 0;
    private retryCount = 0;
    private validationCount = 0;
    private providerExecutions = 0;
    private workspaceTransactions = 0;

    constructor(initialMetrics?: LoopMetrics) {
        if (initialMetrics) {
            this.repairCount = initialMetrics.repairCount;
            this.retryCount = initialMetrics.retryCount;
            this.validationCount = initialMetrics.validationCount;
            this.providerExecutions = initialMetrics.providerExecutions;
            this.workspaceTransactions = initialMetrics.workspaceTransactions;
            this.phaseDurations = { ...initialMetrics.timePerPhase };
        }
    }

    startPhase(phase: ExecutionPhase): void {
        this.phaseStartTimes.set(phase, Date.now());
    }

    endPhase(phase: ExecutionPhase): void {
        const start = this.phaseStartTimes.get(phase);
        if (start) {
            const elapsed = Date.now() - start;
            this.phaseDurations[phase] = (this.phaseDurations[phase] || 0) + elapsed;
            this.phaseStartTimes.delete(phase);
        }
    }

    incrementRepairs(): void {
        this.repairCount++;
    }

    incrementRetries(): void {
        this.retryCount++;
    }

    incrementValidations(): void {
        this.validationCount++;
    }

    incrementProviderExecutions(): void {
        this.providerExecutions++;
    }

    incrementWorkspaceTransactions(): void {
        this.workspaceTransactions++;
    }

    getMetrics(totalTasks: number, completedCount: number, failedCount: number): LoopMetrics {
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
