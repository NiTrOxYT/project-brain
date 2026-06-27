import { EngineeringPlan } from "../engineering-planner/types.js";
import { WorkflowSummary, JournalEvent, WorkflowMetrics, WorkflowDiagnostics, WorkflowRecommendation } from "./types.js";

export class WorkflowReportGenerator {
    generate(
        workflowId: string,
        issue: string,
        status: "Completed" | "Failed" | "Cancelled",
        plan: EngineeringPlan | null,
        journal: JournalEvent[],
        metrics: WorkflowMetrics,
        diagnostics: WorkflowDiagnostics,
        recommendations: WorkflowRecommendation | null
    ): WorkflowSummary {
        // 1. Build Timeline from journal events
        const timeline = journal.map(event => ({
            stage: event.type,
            timestamp: event.timestamp,
            durationMs: event.payload?.durationMs
        }));

        // 2. Build Task Graph from plan
        const taskGraph = plan
            ? {
                  nodes: plan.executionGraph.nodes,
                  edges: plan.executionGraph.edges.map(e => ({ from: e.from, to: e.to }))
              }
            : { nodes: [], edges: [] };

        // 3. Collect Changed Files
        const changedFilesSet = new Set<string>();
        if (plan?.affectedFiles) {
            plan.affectedFiles.forEach(f => changedFilesSet.add(f));
        }
        for (const event of journal) {
            if (event.type === "ExecutionCompleted" && event.payload?.summary?.changedFiles) {
                (event.payload.summary.changedFiles as string[]).forEach(f => changedFilesSet.add(f));
            }
        }
        const changedFiles = Array.from(changedFilesSet);

        // 4. Collect Providers Used
        const providersUsed = Object.keys(metrics.providerUsage);

        // 5. Collect Validation Results from journal
        const validationResults: WorkflowSummary["validationResults"] = [];
        for (const event of journal) {
            if (event.type === "ValidationPassed" || event.type === "ValidationFailed") {
                const results = event.payload?.results || [];
                for (const r of results) {
                    validationResults.push({
                        success: r.success,
                        type: r.type,
                        message: r.message,
                        errors: r.errors,
                        durationMs: r.durationMs || 0
                    });
                }
            }
        }

        // 6. Collect Repair History from journal
        const repairHistory: WorkflowSummary["repairHistory"] = [];
        let currentRepair: { taskId: string; reason: string; startTime: number } | null = null;
        for (const event of journal) {
            if (event.type === "RepairStarted") {
                currentRepair = {
                    taskId: event.payload?.taskId || "",
                    reason: event.payload?.reason || "",
                    startTime: new Date(event.timestamp).getTime()
                };
            } else if (event.type === "RepairCompleted" && currentRepair) {
                const endTime = new Date(event.timestamp).getTime();
                repairHistory.push({
                    taskId: currentRepair.taskId,
                    reason: currentRepair.reason,
                    success: event.payload?.success ?? true,
                    durationMs: endTime - currentRepair.startTime
                });
                currentRepair = null;
            }
        }

        // 7. Extract Learning Summary
        const learningEvent = journal.find(e => e.type === "LearningCompleted");
        const learningSummary = learningEvent
            ? {
                  recordsAdded: learningEvent.payload?.recordsAdded ?? 0,
                  success: learningEvent.payload?.success ?? true
              }
            : undefined;

        return {
            workflowId,
            issue,
            status,
            timeline,
            taskGraph,
            changedFiles,
            providersUsed,
            validationResults,
            repairHistory,
            learningSummary,
            recommendations,
            diagnostics,
            metrics
        };
    }
}
