import {
    SharedMemoryState,
    AgentIdentity,
    AgentSession,
    AgentAssignment,
    AgentObservation,
    AgentArtifact,
    AgentFinding,
    SharedFact,
    SharedConstraint,
    SharedDecision,
    SharedIssue,
    SharedWarning,
    ConsensusProposal,
    ConflictRecord,
    ConflictResolution,
    CollaborationTask,
    CollaborationPhase
} from "./types.js";

export class SharedMemoryModel {
    private readonly state: SharedMemoryState = {
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

    getState(): SharedMemoryState {
        return this.state;
    }

    clear(): void {
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
    addAgent(agent: AgentIdentity): void {
        this.state.agents.set(agent.id, agent);
    }

    removeAgent(agentId: string): void {
        this.state.agents.delete(agentId);
        this.state.sessions.delete(agentId);
    }

    setSession(session: AgentSession): void {
        this.state.sessions.set(session.agentId, session);
    }

    setAssignment(assignment: AgentAssignment): void {
        this.state.assignments.set(assignment.taskId, assignment);
    }

    addObservation(obs: AgentObservation): void {
        this.state.observations.push(obs);
        this.state.observations.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
    }

    addFinding(finding: AgentFinding): void {
        this.state.findings.push(finding);
        this.state.findings.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
    }

    addArtifact(artifact: AgentArtifact): void {
        this.state.artifacts.push(artifact);
        this.state.artifacts.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
    }

    addFact(fact: SharedFact): void {
        this.state.facts.push(fact);
        this.state.facts.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
    }

    addConstraint(constraint: SharedConstraint): void {
        this.state.constraints.push(constraint);
        this.state.constraints.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
    }

    addDecision(decision: SharedDecision): void {
        this.state.decisions.push(decision);
        this.state.decisions.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
    }

    addIssue(issue: SharedIssue): void {
        this.state.issues.push(issue);
        this.state.issues.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
    }

    addWarning(warning: SharedWarning): void {
        this.state.warnings.push(warning);
        this.state.warnings.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
    }

    addProposal(proposal: ConsensusProposal): void {
        this.state.proposals.push(proposal);
        this.state.proposals.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
    }

    addConflict(conflict: ConflictRecord): void {
        this.state.conflicts.push(conflict);
        this.state.conflicts.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
    }

    setResolution(res: ConflictResolution): void {
        this.state.resolutions.set(res.conflictId, res);
    }

    addTask(task: CollaborationTask): void {
        this.state.tasks.set(task.id, task);
    }

    setPhase(phase: CollaborationPhase): void {
        this.state.phase = phase;
    }
}
