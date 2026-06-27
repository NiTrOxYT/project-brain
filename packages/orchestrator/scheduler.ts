import { EngineeringPlan, ExecutionNode } from "../engineering-planner/index.js";
import { ExecutionSchedule, ScheduleBatch } from "./types.js";
import { OrchestratorError } from "./errors.js";

export class OrchestratorScheduler {
    schedule(plan: EngineeringPlan): ExecutionSchedule {
        const batches: ScheduleBatch[] = [];
        let batchIndex = 1;

        // Only schedule active execution tasks (exclude rollback tasks)
        const activeTasks = plan.tasks.filter(t => !t.isRollback);
        const scheduledIds = new Set<string>();

        // Order phases sequentially: PHASE-1 to PHASE-5
        const phaseOrder = ["PHASE-1", "PHASE-2", "PHASE-3", "PHASE-4", "PHASE-5"];

        for (const phaseId of phaseOrder) {
            const phaseTasks = activeTasks.filter(t => t.phaseId === phaseId);
            if (phaseTasks.length === 0) continue;

            const phaseScheduled = new Set<string>();

            while (phaseScheduled.size < phaseTasks.length) {
                // Find all tasks in this phase whose prerequisites are met
                const candidates = phaseTasks.filter(task => {
                    if (phaseScheduled.has(task.id)) return false;
                    
                    // All prerequisites must be scheduled in a PRIOR batch or phase
                    for (const pre of task.prerequisites) {
                        if (!scheduledIds.has(pre)) return false;
                    }
                    return true;
                });

                if (candidates.length === 0) {
                    // Detect dependency deadlock within the phase
                    const unscheduled = phaseTasks.filter(t => !phaseScheduled.has(t.id)).map(t => t.id);
                    throw new OrchestratorError(
                        `Dependency deadlock detected in phase ${phaseId} for tasks: [${unscheduled.join(", ")}]`
                    );
                }

                // Greedily group candidates into a batch without write conflicts
                const batchTasks: ExecutionNode[] = [];
                const targetedFiles = new Set<string>();

                // Sort candidates by ID to guarantee determinism
                const sortedCandidates = [...candidates].sort((a, b) => a.id.localeCompare(b.id));

                for (const task of sortedCandidates) {
                    if (task.file) {
                        const isWriteTask = ["create", "modify", "refactor", "delete"].includes(task.type);
                        if (isWriteTask) {
                            if (targetedFiles.has(task.file)) {
                                // Write conflict: file already modified in this batch. Force sequential execution.
                                continue;
                            }
                            targetedFiles.add(task.file);
                        }
                    }
                    batchTasks.push(task);
                }

                if (batchTasks.length === 0) {
                    // Fallback to avoid infinite loops if constraints are too tight
                    batchTasks.push(sortedCandidates[0]);
                }

                const batchIds = batchTasks.map(t => t.id);
                batches.push({
                    batchIndex,
                    phaseId,
                    taskIds: batchIds
                });

                for (const id of batchIds) {
                    phaseScheduled.add(id);
                    scheduledIds.add(id);
                }

                batchIndex++;
            }
        }

        return { batches };
    }
}
