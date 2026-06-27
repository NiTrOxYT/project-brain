import { MemoryDiagnostics, SharedMemoryState } from "./types.js";

export class CollaborationDiagnostics {
    build(state: SharedMemoryState): MemoryDiagnostics {
        const nodes: any[] = [];
        const edges: any[] = [];
        const ownershipReport: Record<string, string> = {};
        const agentUtilization: Record<string, number> = {};

        // Nodes for registered agents
        for (const [id, agent] of state.agents.entries()) {
            nodes.push({ id: `agent::${id}`, type: "agent", label: agent.name });
            agentUtilization[id] = 0;
        }

        // Nodes for assignments & tasks
        for (const [taskId, assign] of state.assignments.entries()) {
            ownershipReport[taskId] = assign.agentId;
            if (agentUtilization[assign.agentId] !== undefined) {
                agentUtilization[assign.agentId]++;
            }

            nodes.push({ id: `task::${taskId}`, type: "task", label: taskId });
            edges.push({
                from: `agent::${assign.agentId}`,
                to: `task::${taskId}`,
                label: "assigned-to"
            });
        }

        return {
            collaborationGraph: { nodes, edges },
            ownershipReport,
            conflictReport: state.conflicts,
            consensusReport: state.proposals,
            agentUtilization
        };
    }
}
