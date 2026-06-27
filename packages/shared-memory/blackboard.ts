import {
    AgentObservation,
    AgentFinding,
    SharedFact,
    SharedWarning,
    SharedIssue
} from "./types";
import { SharedMemoryModel } from "./memory";

export class Blackboard {
    constructor(private readonly model: SharedMemoryModel) {}

    publishObservation(obs: Omit<AgentObservation, "id" | "timestamp">): AgentObservation {
        const fullObs: AgentObservation = {
            ...obs,
            id: `obs-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString()
        };
        this.model.addObservation(fullObs);
        return fullObs;
    }

    publishFinding(finding: Omit<AgentFinding, "id" | "timestamp">): AgentFinding {
        const fullFinding: AgentFinding = {
            ...finding,
            id: `finding-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString()
        };
        this.model.addFinding(fullFinding);
        return fullFinding;
    }

    publishFact(fact: Omit<SharedFact, "id" | "timestamp">): SharedFact {
        const fullFact: SharedFact = {
            ...fact,
            id: `fact-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString()
        };
        this.model.addFact(fullFact);
        return fullFact;
    }

    publishWarning(warning: Omit<SharedWarning, "id" | "timestamp">): SharedWarning {
        const fullWarning: SharedWarning = {
            ...warning,
            id: `warning-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString()
        };
        this.model.addWarning(fullWarning);
        return fullWarning;
    }

    publishIssue(issue: Omit<SharedIssue, "id" | "timestamp">): SharedIssue {
        const fullIssue: SharedIssue = {
            ...issue,
            id: `issue-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString()
        };
        this.model.addIssue(fullIssue);
        return fullIssue;
    }

    getObservations(): AgentObservation[] {
        return this.model.getState().observations;
    }

    getFindings(): AgentFinding[] {
        return this.model.getState().findings;
    }

    getFacts(): SharedFact[] {
        return this.model.getState().facts;
    }

    getWarnings(): SharedWarning[] {
        return this.model.getState().warnings;
    }

    getIssues(): SharedIssue[] {
        return this.model.getState().issues;
    }
}
