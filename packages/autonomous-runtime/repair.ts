// ──────────────────────────────────────────────────────────────────────────────
// BUILD-051 — Autonomous Execution Loop — Repair
// ──────────────────────────────────────────────────────────────────────────────

import { ExecutionFailure, RepairAction } from "./types.js";
import { RuntimeRequest, RuntimeTask } from "../agent-runtime/types.js";
import { ExecutionNode } from "../engineering-planner/types.js";

export class RepairService {
    createRepairAction(
        failure: ExecutionFailure,
        originalNode: ExecutionNode,
        workspaceRoot: string
    ): RepairAction {
        const taskId = originalNode.id;
        const reason = `Auto-repair triggered for task ${taskId} due to ${failure.category} failure: ${failure.message}`;
        const affectedFiles = originalNode.file
            ? [originalNode.file]
            : (originalNode.affectedFiles || []);

        const repairTask: RuntimeTask = {
            id: `repair-${taskId}-${Date.now()}`,
            type: "modify",
            title: `Repair ${originalNode.title}`,
            file: originalNode.file,
            symbol: originalNode.symbol,
            status: "Running",
            prerequisites: []
        };

        const newRequest: RuntimeRequest = {
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
        let retryStrategy: RepairAction["retryStrategy"] = "refactor";
        let confidence = 80;

        if (failure.category === "Timeout" || failure.category === "Transient" || failure.category === "Cancellation") {
            retryStrategy = "retry_same";
            confidence = 90;
        } else if (failure.category === "Permanent" || failure.category === "Workspace" || failure.category === "Dependency") {
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
