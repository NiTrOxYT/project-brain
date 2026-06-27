import { WorkflowMetrics } from "./types.js";

export class WorkflowMetricsTracker {
    private readonly startTime: number;
    private planningStart = 0;
    private planningEnd = 0;
    private executionStart = 0;
    private executionEnd = 0;
    private validationStart = 0;
    private validationEnd = 0;
    private repairStart = 0;
    private repairEnd = 0;

    private totalPlanningDurationMs = 0;
    private totalExecutionDurationMs = 0;
    private totalValidationDurationMs = 0;
    private totalRepairDurationMs = 0;

    private totalTasks = 0;
    private completedTasks = 0;
    private failedTasks = 0;
    private repairedTasks = 0;
    private retries = 0;
    private validationCount = 0;
    private repairCount = 0;

    private readonly providerUsage: Record<string, number> = {};
    private promptTokens = 0;
    private completionTokens = 0;
    private estimatedCost = 0;

    constructor() {
        this.startTime = Date.now();
    }

    startPlanning(): void {
        this.planningStart = Date.now();
    }

    endPlanning(): void {
        if (this.planningStart > 0) {
            this.totalPlanningDurationMs += Date.now() - this.planningStart;
            this.planningStart = 0;
        }
    }

    startExecution(): void {
        this.executionStart = Date.now();
    }

    endExecution(): void {
        if (this.executionStart > 0) {
            this.totalExecutionDurationMs += Date.now() - this.executionStart;
            this.executionStart = 0;
        }
    }

    startValidation(): void {
        this.validationStart = Date.now();
    }

    endValidation(): void {
        if (this.validationStart > 0) {
            this.totalValidationDurationMs += Date.now() - this.validationStart;
            this.validationStart = 0;
        }
    }

    startRepair(): void {
        this.repairStart = Date.now();
    }

    endRepair(): void {
        if (this.repairStart > 0) {
            this.totalRepairDurationMs += Date.now() - this.repairStart;
            this.repairStart = 0;
        }
    }

    setTaskCounts(total: number, completed: number, failed: number, repaired: number): void {
        this.totalTasks = total;
        this.completedTasks = completed;
        this.failedTasks = failed;
        this.repairedTasks = repaired;
    }

    incrementRetries(count = 1): void {
        this.retries += count;
    }

    incrementValidationCount(count = 1): void {
        this.validationCount += count;
    }

    incrementRepairCount(count = 1): void {
        this.repairCount += count;
    }

    recordProviderUsage(providerId: string, tokens = 0, cost = 0): void {
        this.providerUsage[providerId] = (this.providerUsage[providerId] || 0) + 1;
    }

    addTokens(prompt: number, completion: number): void {
        this.promptTokens += prompt;
        this.completionTokens += completion;
    }

    addCost(cost: number): void {
        this.estimatedCost += cost;
    }

    getMetrics(): WorkflowMetrics {
        const totalDuration = Date.now() - this.startTime;
        const successRate = this.totalTasks > 0 ? (this.completedTasks / this.totalTasks) * 100 : 0;

        return {
            workflowDurationMs: totalDuration,
            planningDurationMs: this.totalPlanningDurationMs,
            executionDurationMs: this.totalExecutionDurationMs,
            validationDurationMs: this.totalValidationDurationMs,
            repairDurationMs: this.totalRepairDurationMs,
            totalTasks: this.totalTasks,
            completedTasks: this.completedTasks,
            failedTasks: this.failedTasks,
            repairedTasks: this.repairedTasks,
            retries: this.retries,
            validationCount: this.validationCount,
            repairCount: this.repairCount,
            providerUsage: { ...this.providerUsage },
            promptTokens: this.promptTokens,
            completionTokens: this.completionTokens,
            estimatedCost: Number(this.estimatedCost.toFixed(6)),
            successRate: Number(successRate.toFixed(2))
        };
    }
}
