export class WorkflowMetricsTracker {
    startTime;
    planningStart = 0;
    planningEnd = 0;
    executionStart = 0;
    executionEnd = 0;
    validationStart = 0;
    validationEnd = 0;
    repairStart = 0;
    repairEnd = 0;
    totalPlanningDurationMs = 0;
    totalExecutionDurationMs = 0;
    totalValidationDurationMs = 0;
    totalRepairDurationMs = 0;
    totalTasks = 0;
    completedTasks = 0;
    failedTasks = 0;
    repairedTasks = 0;
    retries = 0;
    validationCount = 0;
    repairCount = 0;
    providerUsage = {};
    promptTokens = 0;
    completionTokens = 0;
    estimatedCost = 0;
    constructor() {
        this.startTime = Date.now();
    }
    startPlanning() {
        this.planningStart = Date.now();
    }
    endPlanning() {
        if (this.planningStart > 0) {
            this.totalPlanningDurationMs += Date.now() - this.planningStart;
            this.planningStart = 0;
        }
    }
    startExecution() {
        this.executionStart = Date.now();
    }
    endExecution() {
        if (this.executionStart > 0) {
            this.totalExecutionDurationMs += Date.now() - this.executionStart;
            this.executionStart = 0;
        }
    }
    startValidation() {
        this.validationStart = Date.now();
    }
    endValidation() {
        if (this.validationStart > 0) {
            this.totalValidationDurationMs += Date.now() - this.validationStart;
            this.validationStart = 0;
        }
    }
    startRepair() {
        this.repairStart = Date.now();
    }
    endRepair() {
        if (this.repairStart > 0) {
            this.totalRepairDurationMs += Date.now() - this.repairStart;
            this.repairStart = 0;
        }
    }
    setTaskCounts(total, completed, failed, repaired) {
        this.totalTasks = total;
        this.completedTasks = completed;
        this.failedTasks = failed;
        this.repairedTasks = repaired;
    }
    incrementRetries(count = 1) {
        this.retries += count;
    }
    incrementValidationCount(count = 1) {
        this.validationCount += count;
    }
    incrementRepairCount(count = 1) {
        this.repairCount += count;
    }
    recordProviderUsage(providerId, tokens = 0, cost = 0) {
        this.providerUsage[providerId] = (this.providerUsage[providerId] || 0) + 1;
    }
    addTokens(prompt, completion) {
        this.promptTokens += prompt;
        this.completionTokens += completion;
    }
    addCost(cost) {
        this.estimatedCost += cost;
    }
    getMetrics() {
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
