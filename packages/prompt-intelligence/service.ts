import fs from "fs/promises";
import path from "path";
import {
    PromptRequest,
    PromptResponse,
    PromptPackage,
    PromptStatistics,
    PromptDiagnostics,
    PromptSnapshot,
    ProviderExecutionRequest
} from "./types";
import { PromptContextBuilder } from "./builder";
import { PromptAssembler } from "./assembler";
import { PromptOptimizer } from "./optimizer";
import { PromptBudgeter } from "./budget";
import { PromptValidator } from "./validator";
import { PromptRenderer } from "./renderer";
import { PromptFingerprinter } from "./fingerprint";
import { PromptCache } from "./cache";
import { PromptSnapshotManager } from "./snapshot";
import { PromptMetricsCollector } from "./metrics";
import { getProviderProfile } from "./provider-profiles";

export class PromptIntelligenceService {
    private readonly builder: PromptContextBuilder;
    private readonly assembler = new PromptAssembler();
    private readonly optimizer = new PromptOptimizer();
    private readonly budgeter = new PromptBudgeter();
    private readonly validator = new PromptValidator();
    private readonly renderer = new PromptRenderer();
    private readonly fingerprinter = new PromptFingerprinter();
    private readonly cacheManager: PromptCache;
    private readonly snapshotManager: PromptSnapshotManager;
    private readonly metricsCollector: PromptMetricsCollector;

    constructor(private readonly workspaceRoot: string) {
        this.builder = new PromptContextBuilder(workspaceRoot);
        this.cacheManager = new PromptCache(workspaceRoot);
        this.snapshotManager = new PromptSnapshotManager(workspaceRoot);
        this.metricsCollector = new PromptMetricsCollector(workspaceRoot);
    }

    async compile(request: PromptRequest): Promise<PromptPackage> {
        const startTime = Date.now();
        const stages: string[] = [];

        const profile = getProviderProfile(request.providerId);

        // 1. Check cache first
        stages.push("Cache Check");
        const cacheKey = this.cacheManager.generateKey({
            task: request.task,
            providerId: request.providerId
        });
        const cached = await this.cacheManager.get(cacheKey);
        if (cached) {
            await this.metricsCollector.record({
                assemblyTimeMs: Date.now() - startTime,
                optimizationTimeMs: 0,
                originalSize: cached.renderedPrompt.length,
                optimizedSize: cached.renderedPrompt.length,
                tokensSaved: 0,
                providerId: request.providerId,
                templateId: cached.metadata.templateId,
                success: true
            });
            return cached;
        }

        // 2. Build Context
        stages.push("Builder");
        const context = await this.builder.collect(request.task, request.context);

        // 3. Assemble sections
        stages.push("Assembler");
        const sections = this.assembler.assemble(context, profile);
        const originalSize = sections.reduce((acc, s) => acc + s.content.length, 0);

        // 4. Optimize
        stages.push("Optimizer");
        const optStart = Date.now();
        const { optimizedSections, optimizations } = this.optimizer.optimize(sections, request.task.symbol);
        const optDuration = Date.now() - optStart;

        // 5. Budget
        stages.push("Budgeter");
        const { budgetedSections, budget } = this.budgeter.budget(optimizedSections, profile);
        const optimizedSize = budgetedSections.reduce((acc, s) => acc + s.content.length, 0);

        // 6. Validate
        stages.push("Validator");
        this.validator.validate(request.task, budgetedSections, profile, budget);

        // 7. Render
        stages.push("Renderer");
        const renderedPrompt = this.renderer.render(budgetedSections, profile);

        // 8. Fingerprint
        stages.push("Fingerprinter");
        const fingerprint = this.fingerprinter.generate({
            promptContent: renderedPrompt,
            templateVersion: "1.0.0",
            learningVersion: "1.0.0",
            knowledgeVersion: "1.0.0",
            architectureVersion: "1.0.0",
            providerId: request.providerId,
            taskId: request.task.id,
            timestamp: new Date().toISOString()
        });

        // Assemble PromptPackage
        const assemblyDurationMs = Date.now() - startTime;
        const ratio = originalSize > 0 ? optimizedSize / originalSize : 1.0;

        const diagnostics: PromptDiagnostics = {
            assemblyDurationMs,
            originalSize,
            optimizedSize,
            compressionRatio: Number(ratio.toFixed(4)),
            tokenBudget: budget,
            optimizationsApplied: optimizations,
            stages
        };

        const promptPackage: PromptPackage = {
            id: fingerprint.hash.slice(0, 16),
            task: request.task,
            context,
            renderedPrompt,
            metadata: {
                timestamp: fingerprint.timestamp,
                providerId: request.providerId,
                templateId: `tpl-${request.task.type}`,
                hash: fingerprint.hash,
                version: "1.0.0"
            },
            diagnostics
        };

        // Cache and Snapshot
        await this.cacheManager.set(cacheKey, promptPackage);
        await this.snapshotManager.save(promptPackage);
        try {
            const extraSnapshotPath = path.join(this.workspaceRoot, ".brain", "prompts", `${promptPackage.metadata.hash.slice(0, 8)}.json`);
            await fs.writeFile(extraSnapshotPath, JSON.stringify({ id: promptPackage.id, promptPackage, timestamp: new Date().toISOString() }, null, 2), "utf8");
        } catch {}

        // Record metrics
        const tokensSaved = optimizations.reduce((acc, o) => acc + o.tokensSaved, 0);
        await this.metricsCollector.record({
            assemblyTimeMs: assemblyDurationMs,
            optimizationTimeMs: optDuration,
            originalSize,
            optimizedSize,
            tokensSaved,
            providerId: request.providerId,
            templateId: promptPackage.metadata.templateId,
            success: true
        });

        return promptPackage;
    }

    async assemble(request: PromptRequest): Promise<any> {
        const profile = getProviderProfile(request.providerId);
        const context = await this.builder.collect(request.task, request.context);
        return this.assembler.assemble(context, profile);
    }

    optimize(sections: any[], targetSymbol?: string): any {
        return this.optimizer.optimize(sections, targetSymbol);
    }

    validate(task: any, sections: any[], profile: any, budget: any): void {
        this.validator.validate(task, sections, profile, budget);
    }

    render(sections: any[], profile: any): string {
        return this.renderer.render(sections, profile);
    }

    async preview(request: PromptRequest): Promise<string> {
        const pkg = await this.compile(request);
        return pkg.renderedPrompt;
    }

    async statistics(): Promise<PromptStatistics> {
        return this.metricsCollector.getStats();
    }

    async diagnostics(promptPackage: PromptPackage): Promise<PromptDiagnostics> {
        return promptPackage.diagnostics;
    }

    cache(): PromptCache {
        return this.cacheManager;
    }

    async compare(id1: string, id2: string): Promise<any> {
        return this.snapshotManager.compare(id1, id2);
    }

    async buildExecutionRequest(
        task: any,
        context: any,
        providerId: string,
        providerProfile: any
    ): Promise<ProviderExecutionRequest> {
        const promptPackage = await this.compile({ task, context, providerId });
        return {
            ...task,
            runtimeTask: task,
            promptPackage,
            renderedPrompt: promptPackage.renderedPrompt,
            providerProfile,
            metadata: {
                compiledAt: promptPackage.metadata.timestamp,
                fingerprint: promptPackage.metadata.hash,
                compressionRatio: promptPackage.diagnostics.compressionRatio
            }
        };
    }
}
