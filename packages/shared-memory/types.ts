import { SemanticSnapshot } from "../context-compiler/types.js";

export interface AgentIdentity {
    id: string;
    name: string;
    capabilities: string[];
    version: string;
    priority: number;
}

export interface AgentSession {
    agentId: string;
    sessionId: string;
    startedAt: string;
    lastHeartbeatAt: string;
    status: "active" | "inactive" | "dead";
    currentTaskId?: string;
    health: "Healthy" | "Degraded" | "Offline";
}

export interface AgentAssignment {
    taskId: string;
    agentId: string;
    assignedAt: string;
    status: "pending" | "running" | "completed" | "failed";
    completedAt?: string;
    confidence: number;
    reason: string;
}

export interface AgentObservation {
    id: string;
    agentId: string;
    timestamp: string;
    filePath?: string;
    symbolName?: string;
    observation: string;
    severity: "info" | "warning" | "error";
}

export interface AgentArtifact {
    id: string;
    agentId: string;
    taskId: string;
    type: "code" | "documentation" | "test" | "diagnostics" | "patch" | "plan";
    filePath: string;
    content: string;
    timestamp: string;
    metadata: Record<string, any>;
}

export interface AgentFinding {
    id: string;
    agentId: string;
    taskId: string;
    finding: string;
    severity: "low" | "medium" | "high";
    timestamp: string;
}

export interface SharedFact {
    id: string;
    key: string;
    value: string;
    sourceAgentId: string;
    timestamp: string;
}

export interface SharedConstraint {
    id: string;
    rule: string;
    category: string;
    timestamp: string;
}

export interface SharedDecision {
    id: string;
    decision: string;
    rationale: string;
    approvedBy: string[];
    timestamp: string;
}

export interface SharedIssue {
    id: string;
    title: string;
    description: string;
    reportedBy: string;
    status: "open" | "resolved";
    timestamp: string;
}

export interface SharedWarning {
    id: string;
    message: string;
    filePath?: string;
    reportedBy: string;
    timestamp: string;
}

export interface CollaborationTask {
    id: string;
    title: string;
    type: string;
    status: CollaborationStatus;
    prerequisites: string[];
    assignedTo?: string;
    file?: string;
    symbol?: string;
}

export type CollaborationPhase = "Planning" | "Execution" | "Verification" | "Consensus" | "Commit" | "Completed";

export type CollaborationStatus = "Pending" | "Running" | "Completed" | "Failed";

export interface ConsensusProposal {
    id: string;
    proposerAgentId: string;
    title: string;
    description: string;
    proposalType: "artifact" | "decision" | "architecture" | "commit";
    targetId: string;
    votes: Record<string, "accept" | "reject" | "abstain">;
    status: "propose" | "review" | "accept" | "reject" | "finalize";
    timestamp: string;
}

export interface ConsensusDecision {
    proposalId: string;
    decisionType: string;
    finalStatus: "accept" | "reject";
    resolvedAt: string;
    summary: string;
}

export interface ConflictRecord {
    id: string;
    conflictType: "file_collision" | "symbol_collision" | "contradictory_decision" | "duplicate_artifact" | "incompatible_patch";
    conflictingEntities: string[];
    description: string;
    involvedAgents: string[];
    timestamp: string;
    status: "open" | "resolved";
}

export interface ConflictResolution {
    conflictId: string;
    winningEntity: string;
    resolvedByAgentId?: string;
    resolutionRule: string;
    timestamp: string;
}

export interface MemoryEvent {
    id: string;
    type: string;
    timestamp: string;
    agentId?: string;
    payload: any;
}

export interface MemoryTimeline {
    events: MemoryEvent[];
}

export interface MemoryMetrics {
    activeAgentsCount: number;
    completedTasksCount: number;
    conflictsDetectedCount: number;
    conflictsResolvedCount: number;
    proposalsCount: number;
    artifactReuseCount: number;
    consensusDurationMs: number;
    coordinationLatencyMs: number;
}

export interface MemoryStatistics {
    totalEvents: number;
    activeAgents: number;
    averageConsensusMs: number;
    totalConflicts: number;
    resolvedConflicts: number;
    duplicateAvoided: number;
}

export interface MemoryDiagnostics {
    collaborationGraph: {
        nodes: Array<{ id: string; type: string; label: string }>;
        edges: Array<{ from: string; to: string; label: string }>;
    };
    ownershipReport: Record<string, string>;
    conflictReport: ConflictRecord[];
    consensusReport: ConsensusProposal[];
    agentUtilization: Record<string, number>;
}

export interface SharedMemoryState {
    agents: Map<string, AgentIdentity>;
    sessions: Map<string, AgentSession>;
    assignments: Map<string, AgentAssignment>;
    observations: AgentObservation[];
    findings: AgentFinding[];
    artifacts: AgentArtifact[];
    facts: SharedFact[];
    constraints: SharedConstraint[];
    decisions: SharedDecision[];
    issues: SharedIssue[];
    warnings: SharedWarning[];
    proposals: ConsensusProposal[];
    conflicts: ConflictRecord[];
    resolutions: Map<string, ConflictResolution>;
    tasks: Map<string, CollaborationTask>;
    phase: CollaborationPhase;
}

export interface SharedMemorySnapshot {
    snapshotId: string;
    state: {
        agents: Record<string, AgentIdentity>;
        sessions: Record<string, AgentSession>;
        assignments: Record<string, AgentAssignment>;
        observations: AgentObservation[];
        findings: AgentFinding[];
        artifacts: AgentArtifact[];
        facts: SharedFact[];
        constraints: SharedConstraint[];
        decisions: SharedDecision[];
        issues: SharedIssue[];
        warnings: SharedWarning[];
        proposals: ConsensusProposal[];
        conflicts: ConflictRecord[];
        resolutions: Record<string, ConflictResolution>;
        tasks: Record<string, CollaborationTask>;
        phase: CollaborationPhase;
    };
    savedAt: string;
}
