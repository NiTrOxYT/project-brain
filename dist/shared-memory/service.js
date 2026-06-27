import { SharedMemoryModel } from "./memory";
import { AgentRegistry } from "./agent-registry";
import { AssignmentEngine } from "./assignment-engine";
import { Blackboard } from "./blackboard";
import { ArtifactStore } from "./artifact-store";
import { CoordinationEngine } from "./coordination";
import { ConflictDetector } from "./conflict-detector";
import { ConflictResolver } from "./conflict-resolver";
import { ConsensusEngine } from "./consensus";
import { CollaborationTimeline } from "./timeline";
import { SharedMemoryStorage } from "./storage";
import { SharedMemoryMetricsTracker } from "./metrics";
import { CollaborationDiagnostics } from "./diagnostics";
export class SharedMemoryService {
    projectRoot;
    workspaceRoot;
    model = new SharedMemoryModel();
    registry;
    assignmentEngine;
    blackboard;
    artifactStore;
    coordination;
    conflictDetector;
    conflictResolver;
    consensus;
    timeline;
    storage;
    metricsTracker = new SharedMemoryMetricsTracker();
    diagBuilder = new CollaborationDiagnostics();
    constructor(projectRoot, workspaceRoot) {
        this.projectRoot = projectRoot;
        this.workspaceRoot = workspaceRoot;
        this.registry = new AgentRegistry(this.model);
        this.assignmentEngine = new AssignmentEngine(this.model);
        this.blackboard = new Blackboard(this.model);
        this.artifactStore = new ArtifactStore(this.model);
        this.coordination = new CoordinationEngine(this.model);
        this.conflictDetector = new ConflictDetector(this.model);
        this.conflictResolver = new ConflictResolver(this.model);
        this.consensus = new ConsensusEngine(this.model);
        this.timeline = new CollaborationTimeline(workspaceRoot);
        this.storage = new SharedMemoryStorage(workspaceRoot);
    }
    async registerAgent(agent) {
        const session = this.registry.register(agent);
        await this.timeline.append("AgentRegistered", agent.id, { agent, session });
        return session;
    }
    async unregisterAgent(agentId) {
        this.registry.unregister(agentId);
        await this.timeline.append("AgentUnregistered", agentId);
    }
    async assignTasks(tasks, learningRecommendation) {
        const assignments = [];
        for (const t of tasks) {
            this.model.addTask(t);
            const assign = this.assignmentEngine.assign(t, learningRecommendation);
            assignments.push(assign);
            await this.timeline.append("TaskAssigned", assign.agentId, { taskId: t.id, assignment: assign });
        }
        return assignments;
    }
    addTask(task) {
        this.model.addTask(task);
    }
    getTasks() {
        return this.model.getState().tasks;
    }
    async publishObservation(agentId, obs) {
        const full = this.blackboard.publishObservation({ ...obs, agentId });
        await this.timeline.append("ObservationPublished", agentId, { observation: full });
        return full;
    }
    async publishArtifact(agentId, art) {
        const full = this.artifactStore.store({ ...art, agentId });
        await this.timeline.append("ArtifactStored", agentId, { artifact: full });
        return full;
    }
    async publishFinding(agentId, finding) {
        const full = this.blackboard.publishFinding({ ...finding, agentId });
        await this.timeline.append("FindingPublished", agentId, { finding: full });
        return full;
    }
    async publishDecision(decision, rationale, approvedBy) {
        this.model.addDecision({
            id: `dec-${Math.random().toString(36).substr(2, 9)}`,
            decision,
            rationale,
            approvedBy,
            timestamp: new Date().toISOString()
        });
        await this.timeline.append("DecisionRecorded", approvedBy[0], { decision, rationale, approvedBy });
    }
    async claimTask(taskId, agentId) {
        const assign = this.coordination.claimTask(taskId, agentId);
        await this.timeline.append("TaskClaimed", agentId, { taskId, assignment: assign });
        return assign;
    }
    async completeTask(taskId, success) {
        this.coordination.completeTask(taskId, success);
        await this.timeline.append("TaskCompleted", undefined, { taskId, success });
    }
    /** Public delegation to coordination barrier — avoids exposing private field. */
    async waitBarrier(taskIds) {
        return this.coordination.waitBarrier(taskIds);
    }
    detectConflicts() {
        return this.conflictDetector.detect();
    }
    async resolveConflicts(resolvedByAgentId) {
        const open = this.detectConflicts();
        const resolutions = [];
        for (const c of open) {
            const res = this.conflictResolver.resolve(c, resolvedByAgentId);
            resolutions.push(res);
            await this.timeline.append("ConflictResolved", resolvedByAgentId, { conflictId: c.id, resolution: res });
        }
        return resolutions;
    }
    async proposeConsensus(proposal) {
        const prop = this.consensus.propose(proposal);
        await this.timeline.append("ConsensusProposed", proposal.proposerAgentId, { proposal: prop });
        return prop;
    }
    async voteConsensus(proposalId, agentId, vote) {
        this.consensus.vote(proposalId, agentId, vote);
        await this.timeline.append("ConsensusVoted", agentId, { proposalId, vote });
    }
    async finalizeConsensus(proposalId) {
        const dec = this.consensus.finalize(proposalId);
        await this.timeline.append("ConsensusFinalized", undefined, { proposalId, decision: dec });
        return dec;
    }
    setPhase(phase) {
        this.model.setPhase(phase);
    }
    async snapshot(snapshotId) {
        const state = this.model.getState();
        return this.storage.saveSnapshot(state, snapshotId);
    }
    async restore(snapshotId) {
        const snap = await this.storage.loadSnapshot(snapshotId);
        if (snap) {
            this.restoreState(snap.state);
        }
    }
    async restoreLatest() {
        const snap = await this.storage.loadLatest();
        if (snap) {
            this.restoreState(snap.state);
        }
    }
    restoreState(state) {
        this.model.clear();
        const dest = this.model.getState();
        for (const [k, v] of Object.entries(state.agents || {})) {
            dest.agents.set(k, v);
        }
        for (const [k, v] of Object.entries(state.sessions || {})) {
            dest.sessions.set(k, v);
        }
        for (const [k, v] of Object.entries(state.assignments || {})) {
            dest.assignments.set(k, v);
        }
        for (const [k, v] of Object.entries(state.resolutions || {})) {
            dest.resolutions.set(k, v);
        }
        for (const [k, v] of Object.entries(state.tasks || {})) {
            dest.tasks.set(k, v);
        }
        dest.observations = state.observations || [];
        dest.findings = state.findings || [];
        dest.artifacts = state.artifacts || [];
        dest.facts = state.facts || [];
        dest.constraints = state.constraints || [];
        dest.decisions = state.decisions || [];
        dest.issues = state.issues || [];
        dest.warnings = state.warnings || [];
        dest.proposals = state.proposals || [];
        dest.conflicts = state.conflicts || [];
        dest.phase = state.phase || "Planning";
    }
    async statistics() {
        const events = await this.timeline.load();
        return this.metricsTracker.compute(this.model.getState(), events.events.length);
    }
    diagnostics() {
        return this.diagBuilder.build(this.model.getState());
    }
    getTimeline() {
        return this.timeline;
    }
    getArtifacts() {
        return this.artifactStore.list();
    }
    getObservations() {
        return this.blackboard.getObservations();
    }
    getFindings() {
        return this.blackboard.getFindings();
    }
}
