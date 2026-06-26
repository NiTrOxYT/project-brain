// ──────────────────────────────────────────────────────────────────────────────
// BUILD-051 — Autonomous Execution Loop — Repair
// ──────────────────────────────────────────────────────────────────────────────
export class RepairService {
    createRepairAction(failure, originalNode, workspaceRoot) {
        const taskId = originalNode.id;
        const reason = `Auto-repair triggered for task ${taskId} due to ${failure.category} failure: ${failure.message}`;
        const affectedFiles = originalNode.file
            ? [originalNode.file]
            : (originalNode.affectedFiles || []);
        const repairTask = {
            id: `repair-${taskId}-${Date.now()}`,
            type: "modify",
            title: `Repair ${originalNode.title}`,
            file: originalNode.file,
            symbol: originalNode.symbol,
            status: "Running",
            prerequisites: []
        };
        const newRequest = {
            task: repairTask,
            context: {
                workspaceRoot,
                originalTaskId: taskId,
                originalTaskTitle: originalNode.title,
                failureCategory: failure.category,
                failureMessage: failure.message,
                failureDetails: failure.details,
                isRepairAttempt: true
            }
        };
        // Determine retry strategy & confidence based on failure classification
        let retryStrategy = "refactor";
        let confidence = 80;
        if (failure.category === "Timeout" || failure.category === "Transient" || failure.category === "Cancellation") {
            retryStrategy = "retry_same";
            confidence = 90;
        }
        else if (failure.category === "Permanent" || failure.category === "Workspace" || failure.category === "Dependency") {
            retryStrategy = "rollback";
            confidence = 40;
        }
        return {
            taskId,
            reason,
            affectedFiles,
            newRequest,
            retryStrategy,
            confidence
        };
    }
}
