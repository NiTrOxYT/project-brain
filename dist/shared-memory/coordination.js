import { AssignmentError } from "./errors";
export class CoordinationEngine {
    model;
    constructor(model) {
        this.model = model;
    }
    claimTask(taskId, agentId) {
        const state = this.model.getState();
        const task = state.tasks.get(taskId);
        if (!task) {
            throw new AssignmentError(`Task with ID '${taskId}' does not exist.`);
        }
        // Check prerequisites
        for (const prereqId of task.prerequisites) {
            const prereq = state.tasks.get(prereqId);
            if (prereq && prereq.status !== "Completed") {
                throw new AssignmentError(`Prerequisite task '${prereqId}' is not completed yet.`);
            }
        }
        // Check if task is already assigned or running
        const existing = state.assignments.get(taskId);
        if (existing && existing.status !== "pending") {
            throw new AssignmentError(`Task '${taskId}' is already claimed or executed by agent '${existing.agentId}'.`);
        }
        const assignment = {
            taskId,
            agentId,
            assignedAt: new Date().toISOString(),
            status: "running",
            confidence: 95,
            reason: "explicit-agent-claim"
        };
        this.model.setAssignment(assignment);
        task.assignedTo = agentId;
        task.status = "Running";
        return assignment;
    }
    completeTask(taskId, success) {
        const state = this.model.getState();
        const task = state.tasks.get(taskId);
        if (!task) {
            throw new AssignmentError(`Task with ID '${taskId}' does not exist.`);
        }
        const assignment = state.assignments.get(taskId);
        if (assignment) {
            assignment.status = success ? "completed" : "failed";
            assignment.completedAt = new Date().toISOString();
        }
        task.status = success ? "Completed" : "Failed";
    }
    async waitBarrier(taskIds) {
        const state = this.model.getState();
        for (const id of taskIds) {
            const t = state.tasks.get(id);
            if (!t || t.status !== "Completed") {
                return false;
            }
        }
        return true;
    }
}
