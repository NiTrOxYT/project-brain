// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050C — Shared Provider Helpers — Shared Executor Pipeline
// ──────────────────────────────────────────────────────────────────────────────

import { RuntimeTask, RuntimeContext, RuntimeResponse, RuntimeEvent } from "../agent-runtime/types.js";
import { StreamEvent } from "../provider-runtime/types.js";
import { ProviderExecutionService } from "../provider-execution/service.js";
import { ExecutionRequest, StreamChunk } from "../provider-execution/types.js";
import {
    ProcessCancelledError,
    ProcessTimeoutError,
    InvalidExecutableError,
    ProcessSpawnError,
    ProcessExitedError,
    isTransientExitCode
} from "../provider-execution/errors.js";
import {
    TransientProviderError,
    PermanentProviderError
} from "../provider-runtime/errors.js";
import { RuntimeArtifact } from "../agent-runtime/artifacts.js";

export interface SharedExecutionConfig {
    providerId: string;
    executablePath: string;
    args: string[];
    env?: Record<string, string>;
    timeout?: {
        startupTimeoutMs?: number;
        idleTimeoutMs?: number;
        executionTimeoutMs?: number;
    };
    retryPermanentFailureCodes?: number[];
    cancelledTasks: Set<string>;
    execService: ProviderExecutionService;
    parseResponse: (stdout: string) => RuntimeArtifact[];
}

export async function executeProviderTask(
    task: RuntimeTask,
    context: RuntimeContext,
    onEvent: (event: RuntimeEvent) => void,
    onStream: ((event: StreamEvent) => void) | undefined,
    config: SharedExecutionConfig
): Promise<RuntimeResponse> {
    onEvent({ type: "TaskStarted", taskId: task.id, timestamp: new Date().toISOString(), payload: {} });

    const executionRequest: ExecutionRequest = {
        id: task.id,
        executable: config.executablePath,
        args: config.args,
        cwd: context.workspaceRoot || process.cwd(),
        env: config.env || {},
        includeParentEnv: true,
        useSandbox: true,
        timeout: {
            startupTimeoutMs: context.timeout?.startupTimeoutMs || config.timeout?.startupTimeoutMs || 30_000,
            idleTimeoutMs: context.timeout?.idleTimeoutMs || config.timeout?.idleTimeoutMs || 60_000,
            executionTimeoutMs: context.timeout?.executionTimeoutMs || config.timeout?.executionTimeoutMs || 300_000,
            gracefulShutdownMs: 5000,
            forceKillMs: 2000
        },
        retry: {
            maxRetries: 2,
            baseDelayMs: 100,
            backoffFactor: 2,
            maxDelayMs: 1000,
            permanentFailureCodes: config.retryPermanentFailureCodes || [127]
        }
    };

    const startTime = Date.now();
    let retries = 0;

    const onChunk = (chunk: StreamChunk) => {
        if (onStream) {
            if (chunk.channel === "stdout") {
                onStream({
                    type: "Token",
                    taskId: task.id,
                    timestamp: new Date().toISOString(),
                    token: chunk.data
                });
            } else {
                onStream({
                    type: "Log",
                    taskId: task.id,
                    timestamp: new Date().toISOString(),
                    message: chunk.data
                });
            }
        }
    };

    try {
        const result = await config.execService.execute(executionRequest, onChunk);
        retries = result.metrics.retryCount;

        if (config.cancelledTasks.has(task.id)) {
            config.cancelledTasks.delete(task.id);
            throw new ProcessCancelledError(task.id);
        }

        if (result.exitCode !== 0 && result.exitCode !== null) {
            throw new ProcessExitedError(result.exitCode, result.output.stderr, task.id);
        }

        const artifacts = config.parseResponse(result.output.stdout);

        onEvent({ type: "TaskCompleted", taskId: task.id, timestamp: new Date().toISOString(), payload: {} });

        const duration = Date.now() - startTime;

        return {
            taskId: task.id,
            status: "Completed",
            artifacts,
            metrics: {
                provider: config.providerId,
                capability: task.type,
                executionTime: duration,
                retries,
                artifactsProduced: artifacts.length,
                eventsEmitted: 2,
                taskCount: 1,
                cancellationCount: 0,
                pauseCount: 0,
                resumeCount: 0
            },
            model: context.selectedModel,
            providerVersion: result.metrics.exitCode === 0 ? "1.0.0" : undefined,
            sessionId: context.sessionId
        };

    } catch (err: any) {
        onEvent({
            type: "TaskFailed",
            taskId: task.id,
            timestamp: new Date().toISOString(),
            payload: { error: err.message }
        });

        if (config.cancelledTasks.has(task.id)) {
            config.cancelledTasks.delete(task.id);
            throw new TransientProviderError(config.providerId, "Process execution was cancelled");
        }

        const errCode = err.code || (err.constructor && err.constructor.name);

        if (errCode === "PROCESS_CANCELLED" || err instanceof ProcessCancelledError) {
            throw new TransientProviderError(config.providerId, "Process execution was cancelled");
        }

        if (errCode === "PROCESS_EXITED_ERROR" || err instanceof ProcessExitedError) {
            const exitCode = (err as any).exitCode;
            const isTransient = isTransientExitCode(exitCode, executionRequest.retry?.permanentFailureCodes || [127]);
            const message = `Process exited with exit code: ${exitCode}. Stderr: ${err.message}`;
            if (isTransient) {
                throw new TransientProviderError(config.providerId, message);
            } else {
                throw new PermanentProviderError(config.providerId, message);
            }
        }

        if (
            errCode === "PROCESS_TIMEOUT_ERROR" ||
            errCode === "PROCESS_SPAWN_ERROR" ||
            errCode === "INVALID_EXECUTABLE" ||
            err instanceof ProcessTimeoutError ||
            err instanceof ProcessSpawnError ||
            err instanceof InvalidExecutableError
        ) {
            throw new TransientProviderError(config.providerId, err.message);
        }

        throw new PermanentProviderError(config.providerId, err.message);
    }
}
