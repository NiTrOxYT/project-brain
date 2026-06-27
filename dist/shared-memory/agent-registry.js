import { AgentRegistrationError } from "./errors.js";
export class AgentRegistry {
    model;
    constructor(model) {
        this.model = model;
    }
    register(agent) {
        const state = this.model.getState();
        if (state.agents.has(agent.id)) {
            throw new AgentRegistrationError(`Agent with ID '${agent.id}' is already registered.`);
        }
        this.model.addAgent(agent);
        const session = {
            agentId: agent.id,
            sessionId: `session-${Math.random().toString(36).substr(2, 9)}`,
            startedAt: new Date().toISOString(),
            lastHeartbeatAt: new Date().toISOString(),
            status: "active",
            health: "Healthy"
        };
        this.model.setSession(session);
        return session;
    }
    unregister(agentId) {
        const state = this.model.getState();
        if (!state.agents.has(agentId)) {
            throw new AgentRegistrationError(`Agent with ID '${agentId}' is not registered.`);
        }
        this.model.removeAgent(agentId);
    }
    heartbeat(agentId) {
        const state = this.model.getState();
        const session = state.sessions.get(agentId);
        if (!session) {
            throw new AgentRegistrationError(`No active session found for agent ID '${agentId}'.`);
        }
        session.lastHeartbeatAt = new Date().toISOString();
        session.status = "active";
    }
    status(agentId) {
        const state = this.model.getState();
        return state.sessions.get(agentId) || null;
    }
    list() {
        const state = this.model.getState();
        return Array.from(state.agents.values()).sort((a, b) => a.id.localeCompare(b.id));
    }
    lookup(agentId) {
        const state = this.model.getState();
        return state.agents.get(agentId) || null;
    }
}
