import { ConsensusError } from "./errors";
export class ConsensusEngine {
    model;
    constructor(model) {
        this.model = model;
    }
    propose(proposal) {
        const full = {
            ...proposal,
            id: `proposal-${Math.random().toString(36).substr(2, 9)}`,
            votes: {},
            status: "propose",
            timestamp: new Date().toISOString()
        };
        this.model.addProposal(full);
        return full;
    }
    vote(proposalId, agentId, vote) {
        const state = this.model.getState();
        const prop = state.proposals.find(p => p.id === proposalId);
        if (!prop) {
            throw new ConsensusError(`Proposal with ID '${proposalId}' does not exist.`);
        }
        if (prop.status === "finalize") {
            throw new ConsensusError(`Voting has already ended and proposal is finalized.`);
        }
        prop.votes[agentId] = vote;
        prop.status = "review";
    }
    finalize(proposalId) {
        const state = this.model.getState();
        const prop = state.proposals.find(p => p.id === proposalId);
        if (!prop) {
            throw new ConsensusError(`Proposal with ID '${proposalId}' does not exist.`);
        }
        // Count votes
        let acceptCount = 0;
        let rejectCount = 0;
        for (const v of Object.values(prop.votes)) {
            if (v === "accept")
                acceptCount++;
            if (v === "reject")
                rejectCount++;
        }
        const pass = acceptCount > rejectCount || (acceptCount === 0 && rejectCount === 0);
        prop.status = pass ? "accept" : "reject";
        const decision = {
            proposalId,
            decisionType: prop.proposalType,
            finalStatus: pass ? "accept" : "reject",
            resolvedAt: new Date().toISOString(),
            summary: `Votes: ${acceptCount} Accept, ${rejectCount} Reject. Decision: ${pass ? "Accepted" : "Rejected"}`
        };
        prop.status = "finalize";
        return decision;
    }
}
