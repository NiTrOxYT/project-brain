import crypto from "crypto";
import { RuntimeEngine } from "./runtime.js";
import { RuntimeRequest, RuntimeResponse, RuntimeEvent, RuntimeMetrics, TaskLifecycle } from "./types.js";
import { AgentRuntimeError } from "./errors.js";
import { RuntimeMiddleware } from "./middleware.js";
import { RuntimeHooks } from "./hooks.js";
import { RuntimeArtifact } from "./artifacts.js";

function calculateChecksum(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex");
}

export class RuntimeExecutor {
    private activeTaskId?: string;
    private retriesCount = 0;
    private pauseCalls = 0;
    private resumeCalls = 0;
    private cancelCalls = 0;
    private eventsCount = 0;

    constructor(
        private readonly engine: RuntimeEngine,
        private readonly middlewares: RuntimeMiddleware[] = [],
        private readonly hooks: RuntimeHooks[] = [],
        private readonly timings: {
            middleware: Record<string, number>;
            hook: Record<string, number>;
            eventCounts: Record<string, number>;
        } = { middleware: {}, hook: {}, eventCounts: {} }
    ) {}

    private async runMiddleware<K extends keyof RuntimeMiddleware>(
        hookName: K,
        request: RuntimeRequest,
        ...args: any[]
    ): Promise<void> {
        const originalId = request.task.id;
        const originalType = request.task.type;

        for (let i = 0; i < this.middlewares.length; i++) {
            const m = this.middlewares[i];
            const fn = m[hookName];
            if (fn) {
                const name = m.name || `middleware-${i}`;
                const start = Date.now();
                await (fn as any)(request, ...args);
                const elapsed = Date.now() - start;
                this.timings.middleware[name] = (this.timings.middleware[name] || 0) + elapsed;

                // Validate task identity invariant
                if (request.task.id !== originalId || request.task.type !== originalType) {
                    throw new AgentRuntimeError(`Middleware '${name}' mutated task identity (id or type) during ${hookName}`);
                }
            }
        }
    }

    private triggerHook<K extends keyof RuntimeHooks>(
        hookName: K,
        ...args: Parameters<Required<RuntimeHooks>[K]>
    ): void {
        for (const h of this.hooks) {
            const fn = h[hookName];
            if (fn) {
                const start = Date.now();
                try {
                    (fn as any)(...args);
                } catch (err) {
                    // Suppress hook errors to prevent breaking execution flow
                }
                const elapsed = Date.now() - start;
                const name = hookName as string;
                this.timings.hook[name] = (this.timings.hook[name] || 0) + elapsed;
            }
        }
    }

    async executeTask(
        request: RuntimeRequest,
        onEvent: (event: RuntimeEvent) => void
    ): Promise<RuntimeResponse> {
        this.activeTaskId = request.task.id;
        this.retriesCount = 0;
        this.pauseCalls = 0;
        this.resumeCalls = 0;
        this.cancelCalls = 0;
        this.eventsCount = 0;

        const startTime = Date.now();
        let attempt = 1;

        // Trace and suppress duplicate artifacts
        const seenChecksums = new Set<string>();

        const wrappedOnEvent = (event: RuntimeEvent) => {
            this.eventsCount++;
            this.timings.eventCounts[event.type] = (this.timings.eventCounts[event.type] || 0) + 1;

            // Duplicate artifact suppression on events
            if (event.type === "ArtifactProduced") {
                const art = event.payload?.artifact;
                if (art) {
                    const chk = calculateChecksum(art.content);
                    if (seenChecksums.has(chk)) {
                        return; // Suppress duplicate event
                    }
                    seenChecksums.add(chk);
                }
            }

            onEvent(event);
        };

        // Trigger onTaskQueued hook
        this.triggerHook("onTaskQueued", request.task);

        // Run beforeExecute middleware
        await this.runMiddleware("beforeExecute", request);

        // Trigger onTaskStarted hook
        this.triggerHook("onTaskStarted", request.task);

        let lastResponse: RuntimeResponse | null = null;

        while (attempt <= 3) {
            try {
                if (attempt > 1) {
                    wrappedOnEvent({
                        type: "RetryStarted",
                        taskId: request.task.id,
                        timestamp: new Date().toISOString(),
                        payload: { attempt }
                    });

                    // Run beforeRetry middleware
                    await this.runMiddleware("beforeRetry", request, attempt);

                    // Deterministic retry backoff: wait attempt * 10 ms
                    const backoff = attempt * 10;
                    await new Promise(resolve => setTimeout(resolve, backoff));
                }

                // Setup execution timeout race
                const timeoutMs = request.context.timeoutMs;
                let responsePromise: Promise<RuntimeResponse>;

                if (timeoutMs && timeoutMs > 0) {
                    let timeoutId: any;
                    const timeoutPromise = new Promise<never>((_, reject) => {
                        timeoutId = setTimeout(() => {
                            reject(new AgentRuntimeError(`Execution timed out after ${timeoutMs}ms`));
                        }, timeoutMs);
                    });

                    responsePromise = Promise.race([
                        this.engine.execute(request, wrappedOnEvent),
                        timeoutPromise
                    ]).then(res => {
                        clearTimeout(timeoutId);
                        return res;
                    }).catch(err => {
                        clearTimeout(timeoutId);
                        throw err;
                    });
                } else {
                    responsePromise = this.engine.execute(request, wrappedOnEvent);
                }

                const response = await responsePromise;
                lastResponse = response;

                // Run afterRetry if attempt > 1
                if (attempt > 1) {
                    await this.runMiddleware("afterRetry", request, response, attempt);
                }

                if (response.status === "Completed") {
                    // Suppress duplicate artifacts in final response
                    const responseSeen = new Set<string>();
                    response.artifacts = response.artifacts.filter(art => {
                        const chk = calculateChecksum(art.content);
                        if (responseSeen.has(chk)) {
                            return false;
                        }
                        responseSeen.add(chk);
                        return true;
                    });

                    // Normalize and version artifacts
                    for (const art of response.artifacts) {
                        art.version = art.version || "1.0.0";
                        art.createdAt = art.createdAt || new Date().toISOString();
                        art.provider = art.provider || response.metrics.provider || "unknown";
                        art.checksum = art.checksum || calculateChecksum(art.content);
                        art.hash = art.hash || calculateChecksum(`${art.content}:${art.version}:${art.createdAt}:${art.provider}:${art.taskId}`);

                        // Run artifact middlewares
                        await this.runMiddleware("beforeArtifact", request, art);
                        await this.runMiddleware("afterArtifact", request, art);
                    }

                    // Run beforeComplete middleware
                    await this.runMiddleware("beforeComplete", request, response);

                    const elapsed = Date.now() - startTime;
                    response.metrics = this.compileMetrics(response.metrics.provider, request.task.type, elapsed, response.artifacts.length);

                    // Run afterExecute middleware
                    await this.runMiddleware("afterExecute", request, response);

                    // Trigger onTaskFinished hook
                    this.triggerHook("onTaskFinished", request.task, response);

                    return response;
                }

                // Failed run but retries remain
                if (attempt < 3) {
                    this.retriesCount++;
                    attempt++;
                } else {
                    break;
                }
            } catch (error: any) {
                // Trigger onTaskFailed hook
                this.triggerHook("onTaskFailed", request.task, error.message);

                if (attempt < 3) {
                    this.retriesCount++;
                    attempt++;
                } else {
                    const elapsed = Date.now() - startTime;
                    const errorResponse: RuntimeResponse = {
                        taskId: request.task.id,
                        status: "Failed",
                        error: error.message,
                        artifacts: [],
                        metrics: this.compileMetrics("unknown", request.task.type, elapsed, 0)
                    };
                    return errorResponse;
                }
            }
        }

        const elapsed = Date.now() - startTime;
        if (lastResponse) {
            lastResponse.metrics = this.compileMetrics(lastResponse.metrics.provider, request.task.type, elapsed, lastResponse.artifacts.length);
            return lastResponse;
        }

        return {
            taskId: request.task.id,
            status: "Failed",
            error: "Max execution attempts exceeded",
            artifacts: [],
            metrics: this.compileMetrics("unknown", request.task.type, elapsed, 0)
        };
    }

    private compileMetrics(provider: string, capability: string, timeMs: number, artifactsCount: number): RuntimeMetrics {
        return {
            provider,
            capability,
            executionTime: timeMs,
            retries: this.retriesCount,
            artifactsProduced: artifactsCount,
            eventsEmitted: this.eventsCount,
            taskCount: 1,
            cancellationCount: this.cancelCalls,
            pauseCount: this.pauseCalls,
            resumeCount: this.resumeCalls
        };
    }
}
