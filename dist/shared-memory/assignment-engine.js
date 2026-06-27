import { AssignmentError } from "./errors";
export class AssignmentEngine {
    model;
    constructor(model) {
        this.model = model;
    }
    assign(task, learningRecommendation) {
        const state = this.model.getState();
        const agents = Array.from(state.agents.values());
        if (agents.length === 0) {
            throw new AssignmentError("No registered agents available for task assignment.");
        }
        // 1. Filter by capability
        let candidates = agents.filter(a => a.capabilities.includes(task.type));
        if (candidates.length === 0) {
            // Fallback to all agents if no capability match
            candidates = agents;
        }
        // 2. Highest confidence/priority rule
        // Sort descending by priority, then ascending alphabetically by ID
        candidates.sort((a, b) => {
            if (b.priority !== a.priority)
                return b.priority - a.priority;
            return a.id.localeCompare(b.id);
        });
        // 3. Learning Recommendation Override
        let selectedAgent = candidates[0];
        if (learningRecommendation) {
            const matched = agents.find(c => c.id === learningRecommendation);
            if (matched) {
                selectedAgent = matched;
            }
        }
        const assignment = {
            taskId: task.id,
            agentId: selectedAgent.id,
            assignedAt: new Date().toISOString(),
            status: "pending",
            confidence: 90,
            reason: learningRecommendation && selectedAgent.id === learningRecommendation
                ? "learning-recommendation"
                : "highest-capability-priority"
        };
        this.model.setAssignment(assignment);
        task.assignedTo = selectedAgent.id;
        task.status = "Running";
        return assignment;
    }
}
