export class Blackboard {
    model;
    constructor(model) {
        this.model = model;
    }
    publishObservation(obs) {
        const fullObs = {
            ...obs,
            id: `obs-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString()
        };
        this.model.addObservation(fullObs);
        return fullObs;
    }
    publishFinding(finding) {
        const fullFinding = {
            ...finding,
            id: `finding-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString()
        };
        this.model.addFinding(fullFinding);
        return fullFinding;
    }
    publishFact(fact) {
        const fullFact = {
            ...fact,
            id: `fact-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString()
        };
        this.model.addFact(fullFact);
        return fullFact;
    }
    publishWarning(warning) {
        const fullWarning = {
            ...warning,
            id: `warning-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString()
        };
        this.model.addWarning(fullWarning);
        return fullWarning;
    }
    publishIssue(issue) {
        const fullIssue = {
            ...issue,
            id: `issue-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString()
        };
        this.model.addIssue(fullIssue);
        return fullIssue;
    }
    getObservations() {
        return this.model.getState().observations;
    }
    getFindings() {
        return this.model.getState().findings;
    }
    getFacts() {
        return this.model.getState().facts;
    }
    getWarnings() {
        return this.model.getState().warnings;
    }
    getIssues() {
        return this.model.getState().issues;
    }
}
