// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050C — Codex Provider — Provider Implementation
// ──────────────────────────────────────────────────────────────────────────────

import { spawnSync } from "child_process";
import { RuntimeTask, RuntimeContext, RuntimeResponse, RuntimeEvent, AgentCapability } from "../../agent-runtime/types";
import { BaseSDKProvider } from "../../provider-runtime/provider";
import { ProviderMetadata, ProviderProfile, ProviderHealthReport, StreamEvent } from "../../provider-runtime/types";
import { ProviderExecutionService } from "../../provider-execution/service";
import { resolveExecutablePath, getStandardMockContent } from "../shared-resolver";
import { executeProviderTask } from "../shared-executor";
import { buildPrompt } from "./prompt-builder";
import { parseResponse } from "./response-parser";

const CAPABILITIES: AgentCapability[] = [
    "analyze", "create", "modify", "refactor", "validate", "test", "cleanup"
];

const MOCK_CONTENT = getStandardMockContent("Codex", "hello world from codex");

export function resolveCodexPath(): string {
    return resolveExecutablePath("codex", "CODEX_BIN", MOCK_CONTENT);
}

export class CodexProvider extends BaseSDKProvider {
    readonly id = "codex";
    readonly name = "Codex";
    private readonly execService: ProviderExecutionService;
    private readonly cancelledTasks = new Set<string>();

    constructor(execService?: ProviderExecutionService) {
        super();
        this.execService = execService || new ProviderExecutionService();
    }

    metadata(): ProviderMetadata {
        return {
            id: this.id,
            displayName: "Codex (OpenAI)",
            version: "1.0.0",
            vendor: "OpenAI",
            priority: 90,
            supportedCapabilities: CAPABILITIES,
            supportedLanguages: ["typescript", "javascript", "python", "go", "rust", "java"],
            supportedModels: ["o3", "o4-mini", "o4"],
            defaultModel: "o3",
            supportsStreaming: true,
            supportsSessions: false,
            supportsCancellation: true,
            supportsPauseResume: false,
            runtimeCompatibility: "1.0.0"
        };
    }

    profile(): ProviderProfile {
        return {
            metadata: this.metadata(),
            limits: {
                maxContextTokens: 128_000,
                maxOutputTokens: 32_000,
                maxParallelTasks: 2,
                supportsStreaming: true,
                supportsImages: false,
                supportsTools: true,
                supportsSessions: false,
                supportsCancellation: true
            },
            pricing: {
                promptTokenCostPer1k: 0.002,
                completionTokenCostPer1k: 0.010,
                currency: "USD"
            },
            tags: ["reasoning", "coding"]
        };
    }

    async health(): Promise<ProviderHealthReport> {
        const exe = resolveCodexPath();
        let installed = false;
        let authenticated = false;
        let version = "1.0.0";
        const details: Record<string, any> = { executablePath: exe };
        const startTime = Date.now();

        try {
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

            if (installed) {
                const statusRes = spawnSync(exe, ["status"], { encoding: "utf8", timeout: 1000 });
                if (statusRes.status === 0) {
                    authenticated = true;
                    details.statusOutput = statusRes.stdout.trim();
                } else {
                    details.statusError = statusRes.stderr || `Exit code ${statusRes.status}`;
                }
            }
        } catch (err: any) {
            details.error = err.message;
        }

        if (!authenticated && process.env.OPENAI_API_KEY) {
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
        const exe = resolveCodexPath();
        const prompt = buildPrompt({ task, context });

        const env: Record<string, string> = {};
        if (process.env.OPENAI_API_KEY) {
            env.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
        }

        return executeProviderTask(task, context, onEvent, onStream, {
            providerId: this.id,
            executablePath: exe,
            args: [prompt],
            env,
            cancelledTasks: this.cancelledTasks,
            execService: this.execService,
            parseResponse: (stdout) => parseResponse(stdout, task.id, this.id)
        });
    }

    async cancel(taskId: string): Promise<void> {
        this.cancelledTasks.add(taskId);
        this.execService.cancel(taskId);
    }
}
