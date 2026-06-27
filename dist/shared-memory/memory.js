export class SharedMemoryModel {
    state = {
        agents: new Map(),
        sessions: new Map(),
        assignments: new Map(),
        observations: [],
        findings: [],
        artifacts: [],
        facts: [],
        constraints: [],
        decisions: [],
        issues: [],
        warnings: [],
        proposals: [],
        conflicts: [],
        resolutions: new Map(),
        tasks: new Map(),
        phase: "Planning"
    };
    getState() {
        return this.state;
    }
    clear() {
        this.state.agents.clear();
        this.state.sessions.clear();
        this.state.assignments.clear();
        this.state.observations = [];
        this.state.findings = [];
        this.state.artifacts = [];
        this.state.facts = [];
        this.state.constraints = [];
        this.state.decisions = [];
        this.state.issues = [];
        this.state.warnings = [];
        this.state.proposals = [];
        this.state.conflicts = [];
        this.state.resolutions.clear();
        this.state.tasks.clear();
        this.state.phase = "Planning";
    }
    // Setters and modifiers with deterministic ordering (sorting arrays where applicable)
    addAgent(agent) {
        this.state.agents.set(agent.id, agent);
    }
    removeAgent(agentId) {
        this.state.agents.delete(agentId);
        this.state.sessions.delete(agentId);
    }
    setSession(session) {
        this.state.sessions.set(session.agentId, session);
    }
    setAssignment(assignment) {
        this.state.assignments.set(assignment.taskId, assignment);
    }
    addObservation(obs) {
        this.state.observations.push(obs);
        this.state.observations.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
    }
    addFinding(finding) {
        this.state.findings.push(finding);
        this.state.findings.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
    }
    addArtifact(artifact) {
        this.state.artifacts.push(artifact);
        this.state.artifacts.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
    }
    addFact(fact) {
        this.state.facts.push(fact);
        this.state.facts.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
    }
    addConstraint(constraint) {
        this.state.constraints.push(constraint);
        this.state.constraints.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
    }
    addDecision(decision) {
        this.state.decisions.push(decision);
        this.state.decisions.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
    }
    addIssue(issue) {
        this.state.issues.push(issue);
        this.state.issues.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
    }
    addWarning(warning) {
        this.state.warnings.push(warning);
        this.state.warnings.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
    }
    addProposal(proposal) {
        this.state.proposals.push(proposal);
        this.state.proposals.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
    }
    addConflict(conflict) {
        this.state.conflicts.push(conflict);
        this.state.conflicts.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
    }
    setResolution(res) {
        this.state.resolutions.set(res.conflictId, res);
    }
    addTask(task) {
        this.state.tasks.set(task.id, task);
    }
    setPhase(phase) {
        this.state.phase = phase;
    }
}
