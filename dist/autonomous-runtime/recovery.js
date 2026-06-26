// ──────────────────────────────────────────────────────────────────────────────
// BUILD-051 — Autonomous Execution Loop — Recovery
// ──────────────────────────────────────────────────────────────────────────────
import { RecoveryError } from "./errors";
export class ExecutionRecoveryService {
    recover(checkpoint) {
        try {
            return {
                planId: checkpoint.planId,
                completedTasks: new Set(checkpoint.completedTasks),
                failedTasks: new Set(checkpoint.failedTasks),
                activePhase: checkpoint.activePhase,
                workspaceTransactionIds: new Map(Object.entries(checkpoint.workspaceTransactionIds)),
                providerSessions: new Map(Object.entries(checkpoint.providerSessions)),
                retryCounters: new Map(Object.entries(checkpoint.retryCounters)),
                repairCounters: new Map(Object.entries(checkpoint.repairCounters)),
                metrics: checkpoint.metrics,
                failures: [],
                journal: []
            };
        }
        catch (err) {
            throw new RecoveryError(`Failed to recover state from checkpoint: ${err.message}`);
        }
    }
}
