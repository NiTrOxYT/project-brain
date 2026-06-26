// ──────────────────────────────────────────────────────────────────────────────
// BUILD-052 — Learning Engine — Extractor
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs/promises";
import path from "path";
import { ExecutionLoopResult, JournalEvent } from "../autonomous-runtime/types";
import { LearningExperience } from "./types";
import { WorkspaceJournal } from "../workspace/workspace-journal";
import { ProviderMetrics } from "../provider-runtime/types";

export class LearningExtractor {
    constructor(private readonly workspaceRoot: string) {}

    async extract(result: ExecutionLoopResult): Promise<LearningExperience[]> {
        const experiences: LearningExperience[] = [];
        
        // Load Workspace Journal
        const workspaceJournal = new WorkspaceJournal(
            path.join(this.workspaceRoot, ".brain", "workspace")
        );

        // Load all provider metrics
        const providerMetrics = await this.loadProviderMetrics();
        const metricsByTask = new Map<string, ProviderMetrics[]>();
        for (const m of providerMetrics) {
            if (!metricsByTask.has(m.taskId)) {
                metricsByTask.set(m.taskId, []);
            }
            metricsByTask.get(m.taskId)!.push(m);
        }

        // Find all executed tasks from the journal
        const taskEvents = result.journal.filter(
            e => e.type === "TaskStarted"
        );

        for (const startEvent of taskEvents) {
            const taskId = startEvent.payload?.taskId;
            if (!taskId) continue;

            const taskJournal = result.journal.filter(e => e.payload?.taskId === taskId);
            const completedEvent = taskJournal.find(e => e.type === "TaskCompleted");
            const failedEvent = taskJournal.find(e => e.type === "TaskFailed");

            const outcome = completedEvent ? "success" : (failedEvent ? "failure" : "aborted");

            const start = new Date(startEvent.timestamp).getTime();
            const end = completedEvent
                ? new Date(completedEvent.timestamp).getTime()
                : (failedEvent ? new Date(failedEvent.timestamp).getTime() : Date.now());
            const durationMs = end - start;

            const tMetrics = metricsByTask.get(taskId) || [];
            const primaryMetric = tMetrics[0];

            const providerId = primaryMetric?.provider || "mock-provider";
            const modelId = primaryMetric?.model || "mock-model";
            
            const tokensUsed = tMetrics.reduce((sum, m) => sum + m.promptTokens + m.completionTokens, 0);
            const cost = tMetrics.reduce((sum, m) => sum + m.estimatedCost, 0);
            const retries = tMetrics.reduce((sum, m) => sum + m.retries, 0);

            // Repair cycles (count how many validation-failure -> repair runs occurred)
            const repairCycles = taskJournal.filter(e => e.type === "RepairStarted").length;

            // Failures/errors for this task
            const errors = result.errors
                .filter(e => e.taskId === taskId)
                .map(e => e.message);

            // Validation score
            const validationPassed = taskJournal.filter(e => e.type === "ValidationPassed").length;
            const validationFailed = taskJournal.filter(e => e.type === "ValidationFailed").length;
            const totalValidations = validationPassed + validationFailed;
            const validationScore = totalValidations > 0
                ? (validationPassed / totalValidations) * 100
                : 100;

            // Resolve files modified from Workspace Transactions
            const txEvents = taskJournal.filter(e => e.type === "WorkspaceTransactionApplied");
            const filesModifiedSet = new Set<string>();

            for (const txEv of txEvents) {
                const txId = txEv.payload?.transactionId;
                if (txId) {
                    const txEntries = workspaceJournal.readTransaction(txId);
                    for (const entry of txEntries) {
                        if (entry.path) filesModifiedSet.add(entry.path);
                        if (entry.newPath) filesModifiedSet.add(entry.newPath);
                        if (entry.oldPath) filesModifiedSet.add(entry.oldPath);
                    }
                }
            }

            // Fallback: if no transactions but task was created/modified for a file, add it
            const taskFile = startEvent.payload?.taskFile || startEvent.payload?.file;
            if (taskFile && filesModifiedSet.size === 0) {
                filesModifiedSet.add(taskFile);
            }

            experiences.push({
                id: `${result.planId}-${taskId}-${Date.now()}`,
                planId: result.planId,
                timestamp: startEvent.timestamp,
                providerId,
                modelId,
                taskType: startEvent.payload?.taskType || "unknown",
                taskTitle: startEvent.payload?.taskTitle || "unknown",
                outcome,
                durationMs,
                tokensUsed,
                cost,
                filesModified: Array.from(filesModifiedSet),
                repairCycles,
                retries,
                errors,
                validationScore
            });
        }

        return experiences;
    }

    private async loadProviderMetrics(): Promise<ProviderMetrics[]> {
        const metricsDir = path.join(this.workspaceRoot, ".brain", "providers", "metrics");
        const results: ProviderMetrics[] = [];
        try {
            const files = await fs.readdir(metricsDir);
            for (const file of files) {
                if (!file.endsWith(".jsonl")) continue;
                const filePath = path.join(metricsDir, file);
                const raw = await fs.readFile(filePath, "utf8");
                const lines = raw.split("\n");
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const m = JSON.parse(line) as ProviderMetrics;
                        results.push(m);
                    } catch {}
                }
            }
        } catch {}
        return results;
    }
}
