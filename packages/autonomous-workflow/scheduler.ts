import { EngineeringPlan, ExecutionNode } from "../engineering-planner/types.js";

export interface WorkflowScheduleBatch {
    batchIndex: number;
    phaseId: string;
    taskIds: string[];
}

export interface WorkflowSchedule {
    batches: WorkflowScheduleBatch[];
}

export class WorkflowScheduler {
    schedule(
        plan: EngineeringPlan,
        strategy: "sequential" | "dependency" | "concurrency" = "dependency"
    ): WorkflowSchedule {
        const activeTasks = plan.tasks.filter(t => !t.isRollback);
        const batches: WorkflowScheduleBatch[] = [];
        let batchIndex = 1;

        if (strategy === "sequential") {
            // Sort tasks deterministically by phase then by task ID
            const sortedTasks = [...activeTasks].sort((a, b) => {
                if (a.phaseId !== b.phaseId) {
                    return a.phaseId.localeCompare(b.phaseId);
                }
                return a.id.localeCompare(b.id);
            });

            for (const task of sortedTasks) {
                batches.push({
                    batchIndex: batchIndex++,
                    phaseId: task.phaseId,
                    taskIds: [task.id]
                });
            }
            return { batches };
        }

        const scheduledIds = new Set<string>();
        const phaseOrder = ["PHASE-1", "PHASE-2", "PHASE-3", "PHASE-4", "PHASE-5"];

        for (const phaseId of phaseOrder) {
            const phaseTasks = activeTasks.filter(t => t.phaseId === phaseId);
            if (phaseTasks.length === 0) continue;

            const phaseScheduled = new Set<string>();

            while (phaseScheduled.size < phaseTasks.length) {
                // Find candidates in current phase whose prerequisites are met
                const candidates = phaseTasks.filter(task => {
                    if (phaseScheduled.has(task.id)) return false;
                    for (const pre of task.prerequisites) {
                        if (!scheduledIds.has(pre)) return false;
                    }
                    return true;
                });

                if (candidates.length === 0) {
                    const unscheduled = phaseTasks.filter(t => !phaseScheduled.has(t.id)).map(t => t.id);
                    throw new Error(
                        `Dependency deadlock detected in phase ${phaseId} for tasks: [${unscheduled.join(", ")}]`
                    );
                }

                const batchTasks: ExecutionNode[] = [];
                const targetedFiles = new Set<string>();

                // Sort candidates by ID to guarantee determinism
                const sortedCandidates = [...candidates].sort((a, b) => a.id.localeCompare(b.id));

                for (const task of sortedCandidates) {
                    if (strategy === "dependency" && task.file) {
                        const isWriteTask = ["create", "modify", "refactor", "delete"].includes(task.type);
                        if (isWriteTask) {
                            if (targetedFiles.has(task.file)) {
                                // Write conflict: file already modified in this batch.
                                continue;
                            }
                            targetedFiles.add(task.file);
                        }
                    }
                    batchTasks.push(task);
                }

                if (batchTasks.length === 0) {
                    batchTasks.push(sortedCandidates[0]);
                }

                const batchIds = batchTasks.map(t => t.id);
                batches.push({
                    batchIndex: batchIndex++,
                    phaseId,
                    taskIds: batchIds
                });

                for (const id of batchIds) {
                    phaseScheduled.add(id);
                    scheduledIds.add(id);
                }
            }
        }

        return { batches };
    }
}
