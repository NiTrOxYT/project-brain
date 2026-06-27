import {
    AgentIdentity,
    AgentSession,
    AgentAssignment,
    AgentObservation,
    AgentArtifact,
    AgentFinding,
    SharedFact,
    SharedWarning,
    SharedIssue,
    CollaborationTask,
    ConsensusProposal,
    ConsensusDecision,
    ConflictRecord,
    ConflictResolution,
    SharedMemoryState,
    SharedMemorySnapshot,
    MemoryStatistics,
    MemoryDiagnostics,
    CollaborationPhase
} from "./types";
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
    private readonly model = new SharedMemoryModel();
    private readonly registry: AgentRegistry;
    private readonly assignmentEngine: AssignmentEngine;
    private readonly blackboard: Blackboard;
    private readonly artifactStore: ArtifactStore;
    private readonly coordination: CoordinationEngine;
    private readonly conflictDetector: ConflictDetector;
    private readonly conflictResolver: ConflictResolver;
    private readonly consensus: ConsensusEngine;
    private readonly timeline: CollaborationTimeline;
    private readonly storage: SharedMemoryStorage;
    private readonly metricsTracker = new SharedMemoryMetricsTracker();
    private readonly diagBuilder = new CollaborationDiagnostics();

    constructor(
        private readonly projectRoot: string,
        private readonly workspaceRoot: string
    ) {
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

    async registerAgent(agent: AgentIdentity): Promise<AgentSession> {
        const session = this.registry.register(agent);
        await this.timeline.append("AgentRegistered", agent.id, { agent, session });
        return session;
    }

    async unregisterAgent(agentId: string): Promise<void> {
        this.registry.unregister(agentId);
        await this.timeline.append("AgentUnregistered", agentId);
    }

    async assignTasks(tasks: CollaborationTask[], learningRecommendation?: string): Promise<AgentAssignment[]> {
        const assignments: AgentAssignment[] = [];
        for (const t of tasks) {
            this.model.addTask(t);
            const assign = this.assignmentEngine.assign(t, learningRecommendation);
            assignments.push(assign);
            await this.timeline.append("TaskAssigned", assign.agentId, { taskId: t.id, assignment: assign });
        }
        return assignments;
    }

    addTask(task: CollaborationTask): void {
        this.model.addTask(task);
    }

    getTasks(): Map<string, CollaborationTask> {
        return this.model.getState().tasks;
    }

    async publishObservation(agentId: string, obs: Omit<AgentObservation, "id" | "timestamp" | "agentId">): Promise<AgentObservation> {
        const full = this.blackboard.publishObservation({ ...obs, agentId });
        await this.timeline.append("ObservationPublished", agentId, { observation: full });
        return full;
    }

    async publishArtifact(agentId: string, art: Omit<AgentArtifact, "id" | "timestamp" | "agentId">): Promise<AgentArtifact> {
        const full = this.artifactStore.store({ ...art, agentId });
        await this.timeline.append("ArtifactStored", agentId, { artifact: full });
        return full;
    }

    async publishFinding(agentId: string, finding: Omit<AgentFinding, "id" | "timestamp" | "agentId">): Promise<AgentFinding> {
        const full = this.blackboard.publishFinding({ ...finding, agentId });
        await this.timeline.append("FindingPublished", agentId, { finding: full });
        return full;
    }

    async publishDecision(decision: string, rationale: string, approvedBy: string[]): Promise<void> {
        this.model.addDecision({
            id: `dec-${Math.random().toString(36).substr(2, 9)}`,
            decision,
            rationale,
            approvedBy,
            timestamp: new Date().toISOString()
        });
        await this.timeline.append("DecisionRecorded", approvedBy[0], { decision, rationale, approvedBy });
    }

    async claimTask(taskId: string, agentId: string): Promise<AgentAssignment> {
        const assign = this.coordination.claimTask(taskId, agentId);
        await this.timeline.append("TaskClaimed", agentId, { taskId, assignment: assign });
        return assign;
    }

    async completeTask(taskId: string, success: boolean): Promise<void> {
        this.coordination.completeTask(taskId, success);
        await this.timeline.append("TaskCompleted", undefined, { taskId, success });
    }

    /** Public delegation to coordination barrier — avoids exposing private field. */
    async waitBarrier(taskIds: string[]): Promise<boolean> {
        return this.coordination.waitBarrier(taskIds);
    }

    detectConflicts(): ConflictRecord[] {
        return this.conflictDetector.detect();
    }

    async resolveConflicts(resolvedByAgentId?: string): Promise<ConflictResolution[]> {
        const open = this.detectConflicts();
        const resolutions: ConflictResolution[] = [];
        for (const c of open) {
            const res = this.conflictResolver.resolve(c, resolvedByAgentId);
            resolutions.push(res);
            await this.timeline.append("ConflictResolved", resolvedByAgentId, { conflictId: c.id, resolution: res });
        }
        return resolutions;
    }

    async proposeConsensus(proposal: Omit<ConsensusProposal, "id" | "votes" | "status" | "timestamp">): Promise<ConsensusProposal> {
        const prop = this.consensus.propose(proposal);
        await this.timeline.append("ConsensusProposed", proposal.proposerAgentId, { proposal: prop });
        return prop;
    }

    async voteConsensus(proposalId: string, agentId: string, vote: "accept" | "reject" | "abstain"): Promise<void> {
        this.consensus.vote(proposalId, agentId, vote);
        await this.timeline.append("ConsensusVoted", agentId, { proposalId, vote });
    }

    async finalizeConsensus(proposalId: string): Promise<ConsensusDecision> {
        const dec = this.consensus.finalize(proposalId);
        await this.timeline.append("ConsensusFinalized", undefined, { proposalId, decision: dec });
        return dec;
    }

    setPhase(phase: CollaborationPhase): void {
        this.model.setPhase(phase);
    }

    async snapshot(snapshotId: string): Promise<SharedMemorySnapshot> {
        const state = this.model.getState();
        return this.storage.saveSnapshot(state, snapshotId);
    }

    async restore(snapshotId: string): Promise<void> {
        const snap = await this.storage.loadSnapshot(snapshotId);
        if (snap) {
            this.restoreState(snap.state);
        }
    }

    async restoreLatest(): Promise<void> {
        const snap = await this.storage.loadLatest();
        if (snap) {
            this.restoreState(snap.state);
        }
    }

    private restoreState(state: any): void {
        this.model.clear();
        const dest = this.model.getState();

        for (const [k, v] of Object.entries(state.agents || {})) {
            dest.agents.set(k, v as AgentIdentity);
        }
        for (const [k, v] of Object.entries(state.sessions || {})) {
            dest.sessions.set(k, v as AgentSession);
        }
        for (const [k, v] of Object.entries(state.assignments || {})) {
            dest.assignments.set(k, v as AgentAssignment);
        }
        for (const [k, v] of Object.entries(state.resolutions || {})) {
            dest.resolutions.set(k, v as ConflictResolution);
        }
        for (const [k, v] of Object.entries(state.tasks || {})) {
            dest.tasks.set(k, v as CollaborationTask);
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

    async statistics(): Promise<MemoryStatistics> {
        const events = await this.timeline.load();
        return this.metricsTracker.compute(this.model.getState(), events.events.length);
    }

    diagnostics(): MemoryDiagnostics {
        return this.diagBuilder.build(this.model.getState());
    }

    getTimeline(): CollaborationTimeline {
        return this.timeline;
    }

    getArtifacts(): AgentArtifact[] {
        return this.artifactStore.list();
    }

    getObservations(): AgentObservation[] {
        return this.blackboard.getObservations();
    }

    getFindings(): AgentFinding[] {
        return this.blackboard.getFindings();
    }
}
