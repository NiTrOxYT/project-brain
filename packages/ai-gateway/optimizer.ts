// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Gateway Prompt Optimizer
// Orchestrates: QueryEngine → ContextRetrieval → LearningEngine → PromptDiff
// Emits GatewayEventBus events at each stage.
// Never calls LiveConsole directly.
// ──────────────────────────────────────────────────────────────────────────────

import crypto from "crypto";
import { QueryEngineService }       from "../query-engine/service.js";
import { ContextRetrievalService }  from "../context-retrieval/service.js";
import { LearningEngineService }    from "../learning-engine/service.js";
import type { RetrievalSection }    from "../context-retrieval/types.js";
import type { LearningRecommendation } from "../learning-engine/types.js";
import type {
    GatewaySession,
    GatewaySessionMetrics,
    PromptDiff,
} from "./types.js";
import { GatewayEventBus, makeEvent } from "./event-bus.js";
import { PromptDiffEngine, DiffOperation } from "./prompt-diff.js";
import { KernelContext } from "../kernel/index.js";

// ─── Result ───────────────────────────────────────────────────────────────────

export interface OptimizerResult {
    optimizedPrompt:    string;
    diff:               PromptDiff;
    metrics:            GatewaySessionMetrics;
    recommendation:     LearningRecommendation | null;
    retrievedSections:  RetrievalSection[];
    contextDigest:      string;
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface OptimizerOptions {
    /** Max token budget for retrieved context. Default: 8000 */
    contextBudget?: number;
    /** Provider id forwarded to retrieval for capability filtering. */
    providerId?:    string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class GatewayPromptOptimizer {
    private readonly projectRoot:    string;
    private readonly workspaceRoot:  string;
    private readonly bus:            GatewayEventBus;

    private readonly queryEngine:    QueryEngineService;
    private readonly retrieval:      ContextRetrievalService;
    private readonly learning:       LearningEngineService;
    private readonly diffEngine:     PromptDiffEngine;

    constructor(
        contextOrProjectRoot:   KernelContext | string,
        workspaceRoot?:         string,
        bus?:                   GatewayEventBus
    ) {
        if (typeof contextOrProjectRoot === "string") {
            this.projectRoot   = contextOrProjectRoot;
            this.workspaceRoot = workspaceRoot!;
            this.bus           = bus!;
        } else {
            const ctx = contextOrProjectRoot;
            this.projectRoot   = ctx.projectRoot;
            this.workspaceRoot = ctx.workspaceRoot;
            this.bus           = ctx.eventBus as any;
        }

        this.queryEngine = new QueryEngineService(this.projectRoot, this.workspaceRoot);
        this.retrieval   = new ContextRetrievalService(this.projectRoot, this.workspaceRoot);
        this.learning    = new LearningEngineService(this.workspaceRoot);
        this.diffEngine  = new PromptDiffEngine();
    }

    /**
     * Run the full optimization pipeline for a session.
     *
     * Pipeline:
     *   1. QueryEngine.query        — understand intent, get context package
     *   2. ContextRetrieval.retrieve — fetch relevant files/symbols
     *   3. LearningEngine.recommend — load patterns and rules
     *   4. Build optimized prompt   — inject retrieved context
     *   5. PromptDiffEngine.compute — record what was removed/added
     */
    async optimize(
        session: GatewaySession,
        opts:    OptimizerOptions = {}
    ): Promise<OptimizerResult> {
        const pipelineStart = Date.now();
        const budget        = opts.contextBudget ?? 8_000;

        // ── Step 1: Query analysis ────────────────────────────────────────────
        this.bus.emit(makeEvent("QueryAnalysisStarted", session.id, {
            prompt: session.originalPrompt,
        }));

        const queryStart = Date.now();
        let queryResult;
        try {
            queryResult = await this.queryEngine.query({
                query:     session.originalPrompt,
                maxTokens: budget,
                useCache:  true,
            });
        } catch {
            // QueryEngine failure is non-fatal — degrade gracefully.
            queryResult = null;
        }
        const queryMs = Date.now() - queryStart;

        this.bus.emit(makeEvent("QueryAnalysisCompleted", session.id, {
            durationMs:     queryMs,
            tokenEstimate:  queryResult?.diagnostics?.tokenEstimate ?? 0,
            selectedFiles:  queryResult?.diagnostics?.selectedFiles ?? 0,
        }));

        // ── Step 2: Context retrieval ─────────────────────────────────────────
        this.bus.emit(makeEvent("ContextRetrievalStarted", session.id, {
            query:    session.originalPrompt,
            budget,
        }));

        const retrievalStart = Date.now();
        let retrievalResult;
        let retrievedSections: RetrievalSection[] = [];

        try {
            retrievalResult = await this.retrieval.retrieve({
                query:      session.originalPrompt,
                maxTokens:  budget,
                providerId: opts.providerId,
                useCache:   true,
            });
            retrievedSections = retrievalResult.retrievalPackage.sections;
        } catch {
            // Retrieval failure is non-fatal — proceed with empty context.
            retrievalResult = null;
        }
        const retrievalMs = Date.now() - retrievalStart;

        this.bus.emit(makeEvent("ContextRetrievalCompleted", session.id, {
            durationMs:    retrievalMs,
            sections:      retrievedSections.length,
            tokenEstimate: retrievalResult?.metrics?.tokenEstimate ?? 0,
            cacheHit:      retrievalResult?.cacheHit ?? false,
        }));

        // ── Step 3: Learning recommendations ──────────────────────────────────
        this.bus.emit(makeEvent("LearningMatchStarted", session.id, {}));

        const learningStart = Date.now();
        let recommendation: LearningRecommendation | null = null;

        try {
            recommendation = await this.learning.recommend({
                taskType:  "analyze",
                taskTitle: session.originalPrompt.slice(0, 120),
                ...(opts.providerId ? { preferredModel: opts.providerId } : {}),
                contextBudget: budget,
            });
        } catch {
            // Learning failure is non-fatal.
            recommendation = null;
        }
        const learningMs = Date.now() - learningStart;

        this.bus.emit(makeEvent("LearningMatchCompleted", session.id, {
            durationMs:   learningMs,
            rulesApplied: recommendation?.rulesApplied?.length ?? 0,
            confidence:   recommendation?.providerConfidence ?? 0,
        }));

        // ── Step 4: Build optimized prompt ────────────────────────────────────
        this.bus.emit(makeEvent("PromptOptimizationStarted", session.id, {}));

        const ops: DiffOperation[] = [];

        // Build context block from retrieved sections.
        const contextBlock = this.buildContextBlock(retrievedSections, ops);

        // Build learning hints block.
        const learningBlock = this.buildLearningBlock(recommendation, ops);

        // Assemble final optimized prompt.
        const optimizedPrompt = this.assemblePrompt(
            session.originalPrompt,
            contextBlock,
            learningBlock
        );

        // ── Step 5: Compute diff ──────────────────────────────────────────────
        const diff = this.diffEngine.compute(
            session.originalPrompt,
            optimizedPrompt,
            ops
        );

        const metrics: GatewaySessionMetrics = {
            promptTokens:    diff.tokensBefore,
            optimizedTokens: diff.tokensAfter,
            reductionPct:    diff.savedPct,
            retrievedFiles:  retrievedSections.length,
            latencyMs:       retrievalMs,
            estimatedCost:   diff.estimatedSavedUsd,
            learningHits:    recommendation?.rulesApplied?.length ?? 0,
        };

        // Compute context digest — SHA-256 of the retrieved section ids.
        const contextDigest = this.computeDigest(retrievedSections);

        this.bus.emit(makeEvent("PromptOptimizationCompleted", session.id, {
            durationMs:      Date.now() - pipelineStart,
            tokensBefore:    diff.tokensBefore,
            tokensAfter:     diff.tokensAfter,
            savedPct:        diff.savedPct,
            estimatedSavedUsd: diff.estimatedSavedUsd,
            retrievedFiles:  retrievedSections.length,
        }));

        return {
            optimizedPrompt,
            diff,
            metrics,
            recommendation,
            retrievedSections,
            contextDigest,
        };
    }

    // ── Private ───────────────────────────────────────────────────────────────

    /**
     * Build the context preamble from retrieved sections.
     * Records DiffOperations for every section injected.
     */
    private buildContextBlock(
        sections: RetrievalSection[],
        ops:      DiffOperation[]
    ): string {
        if (sections.length === 0) return "";

        const parts: string[] = ["--- Project Brain Context ---"];

        for (const section of sections) {
            ops.push({
                action:  "add",
                kind:    "contextBlock",
                label:   section.name,
                content: section.content,
                reason:  `Retrieved: ${section.reason}`,
            });
            parts.push(`\n[${section.name}]\n${section.content}`);
        }

        parts.push("--- End Context ---\n");
        return parts.join("\n");
    }

    /**
     * Build learning hint block from recommendation.
     * Records DiffOperations for each rule applied.
     */
    private buildLearningBlock(
        rec: LearningRecommendation | null,
        ops: DiffOperation[]
    ): string {
        if (!rec || rec.rulesApplied.length === 0) return "";

        const hints: string[] = ["--- Project Brain Learning ---"];

        for (const rule of rec.rulesApplied) {
            const hint = `Apply pattern: ${rule}`;
            ops.push({
                action:  "add",
                kind:    "learningPattern",
                label:   rule,
                content: hint,
                reason:  "Injected from learning engine history",
            });
            hints.push(hint);
        }

        if (rec.recommendedRepairStrategy) {
            hints.push(`Repair strategy: ${rec.recommendedRepairStrategy}`);
        }

        hints.push("--- End Learning ---\n");
        return hints.join("\n");
    }

    /**
     * Assemble the final optimized prompt.
     * Context and learning blocks are prepended to the original prompt.
     */
    private assemblePrompt(
        original:       string,
        contextBlock:   string,
        learningBlock:  string
    ): string {
        const parts: string[] = [];
        if (contextBlock)   parts.push(contextBlock);
        if (learningBlock)  parts.push(learningBlock);
        parts.push(original);
        return parts.join("\n");
    }

    /**
     * Compute a short SHA-256 digest from the ids of retrieved sections.
     * Used to detect whether the same context was injected in future sessions.
     */
    private computeDigest(sections: RetrievalSection[]): string {
        if (sections.length === 0) return "";
        const ids = sections.map(s => s.id).join("|");
        return crypto.createHash("sha256").update(ids).digest("hex").slice(0, 16);
    }
}
