// ──────────────────────────────────────────────────────────────────────────────
// BUILD-049 — Provider Runtime — Service
// Orchestrates: registration, negotiation, health, retry, fallback,
// metrics, sessions, streaming, and diagnostics.
// Providers never know about workspace internals.
// ──────────────────────────────────────────────────────────────────────────────
import { ProviderRegistry } from "./registry";
import { CapabilityNegotiator } from "./negotiation";
import { HealthMonitor } from "./health";
import { SessionManager } from "./session";
import { MetricsCollector } from "./metrics";
import { MiddlewareChain } from "./middleware";
import { ProviderNegotiationError, PermanentProviderError } from "./errors";
const MAX_RETRIES = 2;
export class ProviderRuntimeService {
    workspaceRoot;
    options;
    registry;
    negotiator;
    healthMonitor;
    sessions;
    metrics;
    middleware;
    lastNegotiationResult;
    totalExecutions = 0;
    totalFallbacks = 0;
    constructor(workspaceRoot, options = {}) {
        this.workspaceRoot = workspaceRoot;
        this.options = options;
        this.registry = new ProviderRegistry();
        this.negotiator = new CapabilityNegotiator();
        this.healthMonitor = new HealthMonitor(options.healthTtlMs ?? 30_000);
        this.sessions = new SessionManager(workspaceRoot);
        this.metrics = new MetricsCollector(workspaceRoot);
        this.middleware = new MiddlewareChain();
    }
    // ─── Registration ────────────────────────────────────────────────────────
    register(provider) {
        this.registry.register(provider);
    }
    unregister(id) {
        this.registry.unregister(id);
        this.healthMonitor.invalidate(id);
    }
    addMiddleware(m) {
        this.middleware.add(m);
    }
    // ─── Execution ───────────────────────────────────────────────────────────
    /**
     * Execute a RuntimeRequest through the Provider Runtime.
     * Full lifecycle: negotiate → execute → retry on transient → fallback on permanent → metrics.
     */
    async execute(request, onEvent = () => { }, onStream) {
        const ctx = {
            capability: request.task.type,
            preferredModel: request.context.preferredModel,
        };
        // Health-aware negotiation
        const candidates = this.registry.discover(request.task.type);
        if (candidates.length === 0) {
            throw new ProviderNegotiationError(request.task.type, "No providers registered for this capability");
        }
        const healthReports = await this.healthMonitor.checkAll(candidates);
        const negotiation = this.negotiator.negotiate(candidates, ctx, healthReports);
        this.lastNegotiationResult = negotiation;
        this.totalExecutions++;
        // Build ordered execution list: winner + fallback chain
        const executionOrder = [
            this.registry.get(negotiation.selectedProvider),
            ...negotiation.fallbackChain
                .map(id => this.registry.get(id))
                .filter((p) => !!p)
        ];
        return this.executeWithFallback(request, executionOrder, negotiation, onEvent, onStream);
    }
    /**
     * Walk the provider list, retrying transient errors and falling back on permanent ones.
     */
    async executeWithFallback(request, providers, negotiation, onEvent, onStream) {
        let lastError;
        for (let provIdx = 0; provIdx < providers.length; provIdx++) {
            const provider = providers[provIdx];
            const isFirstProvider = provIdx === 0;
            // Run fallback middleware if not first provider
            if (!isFirstProvider && providers[provIdx - 1]) {
                await this.middleware.runOnFallback(request, providers[provIdx - 1], provider, lastError?.message ?? "Provider failure");
                this.totalFallbacks++;
            }
            // Retry loop for transient errors
            for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
                const startTime = Date.now();
                try {
                    await this.middleware.runBeforeExecute(request, provider, negotiation);
                    const response = await provider.execute(request.task, { ...request.context, selectedModel: negotiation.selectedModel }, onEvent, onStream);
                    const duration = Date.now() - startTime;
                    const provMetrics = this.buildMetrics(provider, negotiation, request.task.id, response, duration, attempt - 1, provIdx);
                    this.metrics.record(provMetrics);
                    await this.middleware.runAfterExecute(request, response, provMetrics, provider);
                    // Attach SDK metadata to response
                    response.model = negotiation.selectedModel;
                    response.providerDisplayName = provider.metadata().displayName;
                    return response;
                }
                catch (err) {
                    lastError = err;
                    // Permanent error → skip retries, go to next provider
                    if (err instanceof PermanentProviderError || err.retryable === false) {
                        break;
                    }
                    // Transient error → retry if attempts remain
                    if (attempt <= MAX_RETRIES) {
                        await this.middleware.runOnRetry(request, attempt, err, provider);
                        // Deterministic backoff: attempt * 10ms
                        await new Promise(r => setTimeout(r, attempt * 10));
                        continue;
                    }
                    // Exhausted retries → fall through to next provider
                    break;
                }
            }
        }
        // All providers exhausted
        const duration = 0;
        return {
            taskId: request.task.id,
            status: "Failed",
            error: lastError?.message ?? "All providers failed",
            artifacts: [],
            metrics: {
                provider: "none",
                capability: request.task.type,
                executionTime: duration,
                retries: MAX_RETRIES,
                artifactsProduced: 0,
                eventsEmitted: 0,
                taskCount: 1,
                cancellationCount: 0,
                pauseCount: 0,
                resumeCount: 0
            }
        };
    }
    // ─── Sessions ────────────────────────────────────────────────────────────
    createSession(providerId, metadata) {
        return this.sessions.create(providerId, metadata);
    }
    resumeSession(sessionId) {
        return this.sessions.resume(sessionId);
    }
    checkpointSession(sessionId, taskId, state) {
        return this.sessions.checkpoint(sessionId, taskId, state);
    }
    resetSession(sessionId) {
        return this.sessions.reset(sessionId);
    }
    replaySession(sessionId) {
        return this.sessions.replay(sessionId);
    }
    listSessions(providerId) {
        return this.sessions.list(providerId);
    }
    // ─── Diagnostics ─────────────────────────────────────────────────────────
    diagnostics() {
        const all = this.registry.list();
        const healthyCount = this.healthMonitor.countHealthy();
        return {
            totalProviders: all.length,
            healthyProviders: healthyCount,
            totalSessions: this.sessions.size,
            totalExecutions: this.totalExecutions,
            cumulativeMetrics: this.metrics.aggregate(),
            lastNegotiationResult: this.lastNegotiationResult,
            registeredProviderIds: all.map(p => p.id)
        };
    }
    // ─── Shutdown ────────────────────────────────────────────────────────────
    async shutdown() {
        const all = this.registry.list();
        await Promise.all(all.map(p => p.shutdown().catch(() => { })));
    }
    // ─── Internal ────────────────────────────────────────────────────────────
    buildMetrics(provider, negotiation, taskId, response, durationMs, retries, fallbackCount) {
        const meta = provider.metadata();
        // Estimate tokens from artifact content length (deterministic approximation)
        const contentLen = response.artifacts.reduce((sum, a) => sum + a.content.length, 0);
        const approxTokens = Math.ceil(contentLen / 4);
        const promptTokens = response.promptTokens ?? 100;
        const completionTokens = response.completionTokens ?? approxTokens;
        const latencyMs = durationMs;
        // Deterministic cost estimate
        const profile = provider.profile();
        const pricing = profile.pricing;
        const estimatedCost = pricing
            ? (promptTokens / 1000) * pricing.promptTokenCostPer1k +
                (completionTokens / 1000) * pricing.completionTokenCostPer1k
            : 0;
        return {
            provider: meta.id,
            model: negotiation.selectedModel,
            taskId,
            promptTokens,
            completionTokens,
            latencyMs,
            executionDurationMs: durationMs,
            estimatedCost: parseFloat(estimatedCost.toFixed(6)),
            retries,
            workspaceWrites: 0, // Workspace engine handles writes
            artifactsGenerated: response.artifacts.length,
            executionEvents: 0,
            streamEvents: 0,
            fallbackCount,
            knowledgeCacheHits: 0,
            timestamp: new Date().toISOString()
        };
    }
}
