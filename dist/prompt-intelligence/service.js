import fs from "fs/promises";
import path from "path";
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
    workspaceRoot;
    builder;
    assembler = new PromptAssembler();
    optimizer = new PromptOptimizer();
    budgeter = new PromptBudgeter();
    validator = new PromptValidator();
    renderer = new PromptRenderer();
    fingerprinter = new PromptFingerprinter();
    cacheManager;
    snapshotManager;
    metricsCollector;
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.builder = new PromptContextBuilder(workspaceRoot);
        this.cacheManager = new PromptCache(workspaceRoot);
        this.snapshotManager = new PromptSnapshotManager(workspaceRoot);
        this.metricsCollector = new PromptMetricsCollector(workspaceRoot);
    }
    async compile(request) {
        const startTime = Date.now();
        const stages = [];
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
        let snapshot = null;
        try {
            const { ContextSynchronizationService } = await import("../context-sync");
            const syncService = new ContextSynchronizationService(this.workspaceRoot, this.workspaceRoot);
            snapshot = await syncService.latestSnapshot();
        }
        catch { /* ignore */ }
        const context = await this.builder.collect(request.task, request.context, snapshot);
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
        const diagnostics = {
            assemblyDurationMs,
            originalSize,
            optimizedSize,
            compressionRatio: Number(ratio.toFixed(4)),
            tokenBudget: budget,
            optimizationsApplied: optimizations,
            stages
        };
        const promptPackage = {
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
        }
        catch { }
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
    async assemble(request) {
        const profile = getProviderProfile(request.providerId);
        const context = await this.builder.collect(request.task, request.context);
        return this.assembler.assemble(context, profile);
    }
    optimize(sections, targetSymbol) {
        return this.optimizer.optimize(sections, targetSymbol);
    }
    validate(task, sections, profile, budget) {
        this.validator.validate(task, sections, profile, budget);
    }
    render(sections, profile) {
        return this.renderer.render(sections, profile);
    }
    async preview(request) {
        const pkg = await this.compile(request);
        return pkg.renderedPrompt;
    }
    async statistics() {
        return this.metricsCollector.getStats();
    }
    async diagnostics(promptPackage) {
        return promptPackage.diagnostics;
    }
    cache() {
        return this.cacheManager;
    }
    async compare(id1, id2) {
        return this.snapshotManager.compare(id1, id2);
    }
    async buildExecutionRequest(task, context, providerId, providerProfile) {
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
