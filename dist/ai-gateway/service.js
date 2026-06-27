// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Gateway Service
// Main orchestrator of the prompt optimization, provider execution,
// workspace integration, learning, and statistics pipeline.
// Communicates solely via GatewayEventBus.
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import { makeEvent } from "./event-bus.js";
import { AdapterRegistry } from "./adapter-registry.js";
import { ProviderResolverService } from "./provider-resolver.js";
import { GatewayPromptOptimizer } from "./optimizer.js";
import { GatewaySessionStore } from "./session.js";
import { GatewayMetricsStore } from "./metrics.js";
import { GlobalPaths } from "../kernel/index.js";
import { WorkspaceEngine } from "../workspace/workspace-engine.js";
import { ContextSynchronizationService } from "../context-sync/service.js";
import { LearningEngineService } from "../learning-engine/service.js";
// Friendly labels and descriptions for timeline mapping.
const EVENT_LABELS = {
    SessionStarted: "Session Started",
    PromptReceived: "User Prompt Received",
    QueryAnalysisStarted: "Query Analysis Started",
    QueryAnalysisCompleted: "Query Analysis Completed",
    ContextRetrievalStarted: "Context Retrieval Started",
    ContextRetrievalCompleted: "Context Retrieval Completed",
    LearningMatchStarted: "Learning Match Started",
    LearningMatchCompleted: "Learning Match Completed",
    PromptOptimizationStarted: "Prompt Optimization Started",
    PromptOptimizationCompleted: "Prompt Optimization Completed",
    ProviderLaunching: "Provider Launching",
    ProviderStarted: "Provider Started",
    ProviderOutput: "Provider Streaming Output",
    ProviderCompleted: "Provider Executed Successfully",
    ProviderFailed: "Provider Execution Failed",
    WorkspaceTransactionStarted: "Workspace Transaction Started",
    WorkspaceTransactionCommitted: "Workspace Changes Committed",
    LearningRecordStarted: "Learning Session Recording",
    LearningRecorded: "Learning Captured",
    SessionCompleted: "Session Complete",
    SessionFailed: "Session Failed",
    DiagnosticsStarted: "Diagnostics Started",
    DiagnosticsCompleted: "Diagnostics Completed",
};
export class AiGatewayService {
    projectRoot;
    workspaceRoot;
    bus;
    globalPaths;
    optimizer;
    sessions;
    metrics;
    learning;
    constructor(contextOrProjectRoot, workspaceRoot, bus, store, stats) {
        if (typeof contextOrProjectRoot === "string") {
            this.projectRoot = contextOrProjectRoot;
            this.workspaceRoot = workspaceRoot;
            this.bus = bus;
            this.sessions = store ?? new GatewaySessionStore();
            this.metrics = stats ?? new GatewayMetricsStore();
            this.globalPaths = new GlobalPaths();
        }
        else {
            const ctx = contextOrProjectRoot;
            this.projectRoot = ctx.projectRoot;
            this.workspaceRoot = ctx.workspaceRoot;
            this.bus = ctx.eventBus;
            this.sessions = new GatewaySessionStore(ctx.globalPaths);
            this.metrics = new GatewayMetricsStore(ctx.globalPaths);
            this.globalPaths = ctx.globalPaths;
        }
        this.optimizer = new GatewayPromptOptimizer(this.projectRoot, this.workspaceRoot, this.bus);
        this.learning = new LearningEngineService(this.workspaceRoot);
    }
    /**
     * Run the complete gateway pipeline.
     */
    async run(providerId, originalPrompt, extraArgs) {
        const sessionStart = Date.now();
        const sessionId = GatewaySessionStore.newId();
        const session = {
            id: sessionId,
            providerId,
            projectRoot: this.projectRoot,
            workspaceRoot: this.workspaceRoot,
            originalPrompt,
            optimizedPrompt: originalPrompt,
            contextDigest: "",
            timeline: [],
            startedAt: new Date().toISOString(),
        };
        // ── Timeline capturing subscription ──────────────────────────────────
        // Intercepts all events for this session and appends them to session.timeline.
        const unsubscribeTimeline = this.bus.on("*", (ev) => {
            if (ev.sessionId !== sessionId)
                return;
            const elapsed = Date.now() - sessionStart;
            const entry = {
                timestamp: ev.timestamp,
                elapsed,
                kind: ev.kind,
                label: EVENT_LABELS[ev.kind] ?? ev.kind,
            };
            // Capture optional duration and detail from payload
            if (ev.payload["durationMs"] != null) {
                entry.durationMs = ev.payload["durationMs"];
            }
            if (ev.payload["detail"] != null) {
                entry.detail = ev.payload["detail"];
            }
            else if (ev.kind === "ContextRetrievalCompleted") {
                const files = ev.payload["sections"];
                const tokens = ev.payload["tokenEstimate"];
                if (files != null && tokens != null) {
                    entry.detail = `${files} files · ${tokens.toLocaleString()} tokens`;
                }
            }
            else if (ev.kind === "PromptOptimizationCompleted") {
                const pct = ev.payload["savedPct"];
                if (pct != null) {
                    entry.detail = `↓${pct}% reduction`;
                }
            }
            else if (ev.kind === "LearningRecorded") {
                const patterns = ev.payload["patterns"];
                if (patterns != null) {
                    entry.detail = `${patterns} new pattern${patterns !== 1 ? "s" : ""} recorded`;
                }
            }
            session.timeline.push(entry);
        });
        // ── Start pipeline ───────────────────────────────────────────────────
        this.bus.emit(makeEvent("SessionStarted", sessionId, { providerId }));
        this.bus.emit(makeEvent("PromptReceived", sessionId, { prompt: originalPrompt }));
        let outcome = "success";
        let optResult;
        try {
            // 1. Optimize prompt
            optResult = await this.optimizer.optimize(session, {
                providerId,
            });
            session.optimizedPrompt = optResult.optimizedPrompt;
            session.contextDigest = optResult.contextDigest;
            session.diff = optResult.diff;
            session.metrics = optResult.metrics;
            // 2. Resolve and Launch provider
            this.bus.emit(makeEvent("ProviderLaunching", sessionId, { providerId }));
            const resolver = new ProviderResolverService(this.globalPaths);
            const resolution = await resolver.resolve(providerId);
            if (!resolution.executableExists || !resolution.executable) {
                const reason = !resolution.resolvedBinary ? "Binary not found in PATH or manifest" :
                    !resolution.executableExists ? "File does not exist" : "File is not executable";
                throw new Error(`Failed to launch provider "${providerId}"\n` +
                    `Resolved Binary\n` +
                    `    ${resolution.resolvedBinary || "None"}\n` +
                    `Exists\n` +
                    `    ${resolution.executableExists ? "YES" : "NO"}\n` +
                    `Executable\n` +
                    `    ${resolution.executable ? "YES" : "NO"}\n` +
                    `Spawn\n` +
                    `    FAILED\n` +
                    `Reason\n` +
                    `    ${reason}\n` +
                    `Run:\n` +
                    `    brain doctor providers`);
            }
            const adapter = AdapterRegistry.lookup(providerId);
            const processInstance = await adapter.launch({
                session,
                optimizedPrompt: optResult.optimizedPrompt,
                extraArgs,
                resolvedBinary: resolution.resolvedBinary,
            });
            this.bus.emit(makeEvent("ProviderStarted", sessionId, { pid: processInstance.pid }));
            // 3. Stream stdout
            const stdoutPromise = (async () => {
                for await (const chunk of processInstance.stdout) {
                    this.bus.emit(makeEvent("ProviderOutput", sessionId, { chunk }));
                }
            })();
            // 4. Stream stderr (can be logged or processed if needed)
            const stderrPromise = (async () => {
                for await (const chunk of processInstance.stderr) {
                    // For now, we print stderr directly as well.
                    process.stderr.write(chunk);
                }
            })();
            await Promise.all([stdoutPromise, stderrPromise]);
            const exitResult = await processInstance.wait();
            if (exitResult.signal === "SIGINT" || exitResult.signal === "SIGTERM" || exitResult.code === 130) {
                outcome = "cancelled";
            }
            else if (exitResult.code !== 0 && exitResult.code !== null) {
                throw new Error(`Provider process exited with code ${exitResult.code}`);
            }
            this.bus.emit(makeEvent("ProviderCompleted", sessionId, {
                code: exitResult.code,
                signal: exitResult.signal,
            }));
        }
        catch (err) {
            outcome = "failed";
            // Build LaunchReport
            const resolver = new ProviderResolverService(this.globalPaths);
            let resolution = null;
            try {
                resolution = await resolver.resolve(providerId);
            }
            catch { }
            const gp = this.globalPaths;
            const report = {
                provider: providerId,
                wrapperPath: gp.binEntry(providerId),
                manifestPath: path.join(gp.wrappersDir, "manifest.json"),
                storedBinary: resolution?.storedBinary,
                resolvedBinary: resolution?.resolvedBinary,
                executableExists: resolution?.executableExists ?? false,
                executable: resolution?.executable ?? false,
                cwd: process.cwd(),
                command: [resolution?.resolvedBinary || providerId, ...extraArgs],
                envPath: (process.env.PATH || "").split(path.delimiter),
                spawnSucceeded: false,
                error: {
                    code: err.code || "SPAWN_ERROR",
                    message: err.message,
                    stack: err.stack,
                }
            };
            session.launchReport = report;
            this.bus.emit(makeEvent("ProviderFailed", sessionId, { error: err.message }));
            this.bus.emit(makeEvent("SessionFailed", sessionId, { error: err.message }));
        }
        // ── Post-execution steps ─────────────────────────────────────────────
        if (outcome === "success" && optResult) {
            // 6. Workspace integration (commit changes to WorkspaceEngine)
            this.bus.emit(makeEvent("WorkspaceTransactionStarted", sessionId, {}));
            let txId = "";
            const changes = [];
            try {
                // Sync incremental context to locate any files changed on disk
                const syncService = new ContextSynchronizationService(this.projectRoot, this.workspaceRoot);
                const syncResult = await syncService.sync({
                    projectRoot: this.projectRoot,
                    workspaceRoot: this.workspaceRoot,
                });
                if (syncResult && syncResult.patch) {
                    const workspaceEngine = new WorkspaceEngine({ workspaceRoot: this.workspaceRoot });
                    const artifacts = [];
                    // Stage sections or files changed during execution
                    const changedFiles = syncResult.patch.metadataUpdate.fileCount > 0;
                    if (changedFiles) {
                        // Gather modified files
                        const files = syncResult.snapshot.files;
                        for (const file of files) {
                            const absPath = path.join(this.workspaceRoot, file.path);
                            if (fs.existsSync(absPath)) {
                                const content = fs.readFileSync(absPath, "utf8");
                                artifacts.push({
                                    id: file.path,
                                    taskId: sessionId,
                                    type: "modify",
                                    path: file.path,
                                    content,
                                });
                            }
                        }
                    }
                    if (artifacts.length > 0) {
                        const wsResult = await workspaceEngine.applyArtifacts(artifacts);
                        txId = wsResult.transactionId;
                        changes.push(...wsResult.changes.map(c => c.path));
                    }
                }
            }
            catch {
                // Workspace committing/sync is best-effort for raw CLI executions
            }
            this.bus.emit(makeEvent("WorkspaceTransactionCommitted", sessionId, {
                transactionId: txId,
                changes,
            }));
            // 7. Learning recording
            this.bus.emit(makeEvent("LearningRecordStarted", sessionId, {}));
            let recordsAdded = 0;
            try {
                // Construct a mock ExecutionLoopResult to feed into learning engine
                const mockExec = {
                    id: sessionId,
                    status: "Completed",
                    planId: "gateway-plan",
                    outcome: "success",
                    journal: [
                        { type: "WorkspaceTransactionApplied", payload: { transactionId: txId } }
                    ],
                };
                const learnResult = await this.learning.learn(mockExec);
                recordsAdded = learnResult.recordsAdded;
            }
            catch {
                // Learning record is best-effort
            }
            this.bus.emit(makeEvent("LearningRecorded", sessionId, { patterns: recordsAdded }));
            // Save completed state
            session.completedAt = new Date().toISOString();
            session.outcome = "success";
            // Save session & update metrics
            this.sessions.save(session);
            this.metrics.update(session, recordsAdded);
            this.bus.emit(makeEvent("SessionCompleted", sessionId, {
                tokensAfter: session.metrics?.optimizedTokens,
                savedPct: session.metrics?.reductionPct,
                estimatedCost: session.metrics?.estimatedCost,
                estimatedSavedUsd: session.diff?.estimatedSavedUsd,
                learningHits: recordsAdded,
            }));
        }
        else {
            session.completedAt = new Date().toISOString();
            session.outcome = outcome;
            this.sessions.save(session);
        }
        // Clean up timeline tracking subscription
        unsubscribeTimeline();
        return session;
    }
}
