// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050B — Claude Code Provider — Provider Implementation
// ──────────────────────────────────────────────────────────────────────────────

import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

import { RuntimeTask, RuntimeContext, RuntimeResponse, RuntimeEvent, AgentCapability } from "../../agent-runtime/types.js";
import { BaseSDKProvider } from "../../provider-runtime/provider.js";
import { ProviderMetadata, ProviderProfile, ProviderHealthReport, StreamEvent } from "../../provider-runtime/types.js";
import { ProviderExecutionService } from "../../provider-execution/service.js";
import { ExecutionRequest, StreamChunk } from "../../provider-execution/types.js";
import {
    ProcessCancelledError,
    ProcessTimeoutError,
    InvalidExecutableError,
    ProcessSpawnError,
    ProcessExitedError,
    isTransientExitCode
} from "../../provider-execution/errors.js";
import {
    TransientProviderError,
    PermanentProviderError
} from "../../provider-runtime/errors.js";
import { buildPrompt } from "./prompt-builder.js";
import { parseResponse } from "./response-parser.js";

const CAPABILITIES: AgentCapability[] = [
    "analyze", "create", "modify", "refactor", "validate", "document", "test", "cleanup"
];

function ensureMockClaudeCli(): string {
    const tempDir = path.join(os.tmpdir(), "brain-claude-mock");
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    const mockPath = path.join(tempDir, "claude");
    
    const content = `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

if (args.includes('--version')) {
    console.log('claude version 1.0.0');
    process.exit(0);
}

if (args.includes('status')) {
    console.log('Logged in as test-user');
    process.exit(0);
}

const prompt = args[0] || '';

if (prompt.includes('SIMULATE_TIMEOUT')) {
    setTimeout(() => {}, 999999);
    return;
}

if (prompt.includes('SIMULATE_FAILURE')) {
    console.error('Simulated CLI execution failure');
    process.exit(1);
}

if (prompt.includes('SIMULATE_PERMANENT_FAILURE')) {
    console.error('Permanent command error');
    process.exit(127);
}

if (prompt.includes('SIMULATE_STREAM')) {
    process.stdout.write('Streaming token 1\\n');
    setTimeout(() => {
        process.stdout.write('Streaming token 2\\n');
        setTimeout(() => {
            console.log('---START_ARTIFACTS---');
            console.log(JSON.stringify({
                artifacts: [{
                    id: 'art-stream',
                    type: 'code',
                    path: 'stream-file.txt',
                    content: 'streamed content'
                }]
            }));
            console.log('---END_ARTIFACTS---');
        }, 50);
    }, 50);
    return;
}

console.log('Hello from mock Claude CLI!');
console.log('---START_ARTIFACTS---');
console.log(JSON.stringify({
    artifacts: [{
        id: 'art-1',
        type: 'code',
        path: 'test-file.txt',
        content: 'hello world from claude'
    }]
}));
console.log('---END_ARTIFACTS---');
`;
    
    fs.writeFileSync(mockPath, content, { mode: 0o755 });
    return mockPath;
}

export function resolveClaudePath(): string {
    if (process.env.CLAUDE_BIN) {
        return process.env.CLAUDE_BIN;
    }
    const pathDirs = (process.env.PATH || "").split(path.delimiter);
    for (const dir of pathDirs) {
        const fullPath = path.join(dir, "claude");
        try {
            if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
                if (process.platform !== "win32") {
                    const stats = fs.statSync(fullPath);
                    const isExecutable = !!(stats.mode & parseInt("0111", 8));
                    if (!isExecutable) continue;
                }
                return fullPath;
            }
        } catch {}
    }
    return ensureMockClaudeCli();
}

export class ClaudeCodeProvider extends BaseSDKProvider {
    readonly id = "claude-code";
    readonly name = "Claude Code";
    private readonly execService: ProviderExecutionService;
    private readonly cancelledTasks = new Set<string>();

    constructor(execService?: ProviderExecutionService) {
        super();
        this.execService = execService || new ProviderExecutionService();
    }

    metadata(): ProviderMetadata {
        return {
            id: this.id,
            displayName: "Claude Code (Anthropic)",
            version: "1.0.0",
            vendor: "Anthropic",
            priority: 100,
            supportedCapabilities: CAPABILITIES,
            supportedLanguages: ["typescript", "javascript", "python", "go", "rust", "java", "c++"],
            supportedModels: ["claude-sonnet-4-5", "claude-opus-4", "claude-haiku-4"],
            defaultModel: "claude-sonnet-4-5",
            supportsStreaming: true,
            supportsSessions: true,
            supportsCancellation: true,
            supportsPauseResume: false,
            runtimeCompatibility: "1.0.0"
        };
    }

    profile(): ProviderProfile {
        return {
            metadata: this.metadata(),
            limits: {
                maxContextTokens: 200_000,
                maxOutputTokens: 64_000,
                maxParallelTasks: 1,
                supportsStreaming: true,
                supportsImages: true,
                supportsTools: true,
                supportsSessions: true,
                supportsCancellation: true
            },
            pricing: {
                promptTokenCostPer1k: 0.003,
                completionTokenCostPer1k: 0.015,
                currency: "USD"
            },
            tags: ["flagship", "coding", "reasoning"]
        };
    }

    async health(): Promise<ProviderHealthReport> {
        const exe = resolveClaudePath();
        let installed = false;
        let authenticated = false;
        let version = "1.0.0";
        const details: Record<string, any> = { executablePath: exe };
        const startTime = Date.now();

        try {
            // Check version
            const versionRes = spawnSync(exe, ["--version"], { encoding: "utf8", timeout: 1000 });
            if (versionRes.status === 0) {
                installed = true;
                const match = versionRes.stdout.match(/(\d+\.\d+\.\d+)/);
                if (match) {
                    version = match[1];
                }
            } else {
                details.versionError = versionRes.stderr || `Exit code ${versionRes.status}`;
            }

            // Check status
            if (installed) {
                const statusRes = spawnSync(exe, ["status"], { encoding: "utf8", timeout: 1000 });
                if (statusRes.status === 0) {
                    const stdout = statusRes.stdout.toLowerCase();
                    if (stdout.includes("logged in") || stdout.includes("authenticated")) {
                        authenticated = true;
                    }
                    details.statusOutput = statusRes.stdout.trim();
                } else {
                    details.statusError = statusRes.stderr || `Exit code ${statusRes.status}`;
                }
            }
        } catch (err: any) {
            details.error = err.message;
        }

        // Fallback check via Env API key
        if (!authenticated && process.env.ANTHROPIC_API_KEY) {
            authenticated = true;
        }

        const latencyMs = Date.now() - startTime;
        let status: ProviderHealthReport["status"] = "Offline";
        if (installed && authenticated) {
            status = "Healthy";
        } else if (installed) {
            status = "Degraded";
        }

        return {
            status,
            authenticated,
            installed,
            latencyMs,
            lastHeartbeat: new Date().toISOString(),
            version,
            details
        };
    }

    async execute(
        task: RuntimeTask,
        context: RuntimeContext,
        onEvent: (event: RuntimeEvent) => void,
        onStream?: (event: StreamEvent) => void
    ): Promise<RuntimeResponse> {
        onEvent({ type: "TaskStarted", taskId: task.id, timestamp: new Date().toISOString(), payload: {} });

        const exe = resolveClaudePath();
        const prompt = buildPrompt({ task, context });

        const sanitizedEnv: Record<string, string> = {};
        if (process.env.ANTHROPIC_API_KEY) {
            sanitizedEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
        }
        if (context.sessionId) {
            sanitizedEnv.CLAUDE_SESSION_ID = context.sessionId;
        }

        const executionRequest: ExecutionRequest = {
            id: task.id,
            executable: exe,
            args: [prompt],
            cwd: context.workspaceRoot || process.cwd(),
            env: sanitizedEnv,
            includeParentEnv: true,
            useSandbox: true,
            timeout: {
                startupTimeoutMs: context.timeout?.startupTimeoutMs || 30_000,
                idleTimeoutMs: context.timeout?.idleTimeoutMs || 60_000,
                executionTimeoutMs: context.timeout?.executionTimeoutMs || 300_000,
                gracefulShutdownMs: 5000,
                forceKillMs: 2000
            },
            retry: {
                maxRetries: 2,
                baseDelayMs: 100,
                backoffFactor: 2,
                maxDelayMs: 1000,
                permanentFailureCodes: [127]
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
            const result = await this.execService.execute(executionRequest, onChunk);
            retries = result.metrics.retryCount;

            if (this.cancelledTasks.has(task.id)) {
                this.cancelledTasks.delete(task.id);
                throw new ProcessCancelledError(task.id);
            }

            if (result.exitCode !== 0 && result.exitCode !== null) {
                throw new ProcessExitedError(result.exitCode, result.output.stderr, task.id);
            }

            const artifacts = parseResponse(result.output.stdout, task.id, this.id);

            onEvent({ type: "TaskCompleted", taskId: task.id, timestamp: new Date().toISOString(), payload: {} });

            const duration = Date.now() - startTime;

            return {
                taskId: task.id,
                status: "Completed",
                artifacts,
                metrics: {
                    provider: this.id,
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
                model: context.selectedModel || this.metadata().defaultModel,
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

            if (this.cancelledTasks.has(task.id)) {
                this.cancelledTasks.delete(task.id);
                throw new TransientProviderError(this.id, "Process execution was cancelled");
            }

            const errCode = err.code || (err.constructor && err.constructor.name);

            if (errCode === "PROCESS_CANCELLED" || err instanceof ProcessCancelledError) {
                throw new TransientProviderError(this.id, "Process execution was cancelled");
            }

            if (errCode === "PROCESS_EXITED_ERROR" || err instanceof ProcessExitedError) {
                const exitCode = (err as any).exitCode;
                const isTransient = isTransientExitCode(exitCode, executionRequest.retry?.permanentFailureCodes || [127]);
                const message = `Process exited with exit code: ${exitCode}. Stderr: ${err.message}`;
                if (isTransient) {
                    throw new TransientProviderError(this.id, message);
                } else {
                    throw new PermanentProviderError(this.id, message);
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
                throw new TransientProviderError(this.id, err.message);
            }

            throw new PermanentProviderError(this.id, err.message);
        }
    }

    async cancel(taskId: string): Promise<void> {
        this.cancelledTasks.add(taskId);
        this.execService.cancel(taskId);
    }
}
