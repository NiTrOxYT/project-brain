// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050C — Ollama Provider — Provider Implementation
// ──────────────────────────────────────────────────────────────────────────────

import { spawnSync } from "child_process";
import { RuntimeTask, RuntimeContext, RuntimeResponse, RuntimeEvent, AgentCapability } from "../../agent-runtime/types.js";
import { BaseSDKProvider } from "../../provider-runtime/provider.js";
import { ProviderMetadata, ProviderProfile, ProviderHealthReport, StreamEvent } from "../../provider-runtime/types.js";
import { ProviderExecutionService } from "../../provider-execution/service.js";
import { resolveExecutablePath, getStandardMockContent } from "../shared-resolver.js";
import { executeProviderTask } from "../shared-executor.js";
import { buildPrompt } from "./prompt-builder.js";
import { parseResponse } from "./response-parser.js";

const CAPABILITIES: AgentCapability[] = ["analyze", "create", "modify", "refactor", "cleanup"];

const MOCK_CONTENT = getStandardMockContent("Ollama", "hello world from ollama");

export function resolveOllamaPath(): string {
    return resolveExecutablePath("ollama", "OLLAMA_BIN", MOCK_CONTENT);
}

export class OllamaProvider extends BaseSDKProvider {
    readonly id = "ollama";
    readonly name = "Ollama";
    private readonly execService: ProviderExecutionService;
    private readonly cancelledTasks = new Set<string>();

    constructor(execService?: ProviderExecutionService) {
        super();
        this.execService = execService || new ProviderExecutionService();
    }

    metadata(): ProviderMetadata {
        return {
            id: this.id,
            displayName: "Ollama (Local)",
            version: "1.0.0",
            vendor: "Ollama",
            priority: 10,
            supportedCapabilities: CAPABILITIES,
            supportedLanguages: ["typescript", "javascript", "python", "go", "rust", "c++"],
            supportedModels: ["qwen2.5-coder", "deepseek-coder-v2", "codellama", "starcoder2"],
            defaultModel: "qwen2.5-coder",
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
                maxContextTokens: 32_000,
                maxOutputTokens: 8_000,
                maxParallelTasks: 1,
                supportsStreaming: true,
                supportsImages: false,
                supportsTools: false,
                supportsSessions: false,
                supportsCancellation: true
            },
            pricing: {
                promptTokenCostPer1k: 0,
                completionTokenCostPer1k: 0,
                currency: "USD"
            },
            tags: ["local", "offline", "free"]
        };
    }

    async health(): Promise<ProviderHealthReport> {
        const exe = resolveOllamaPath();
        let installed = false;
        let authenticated = true; // Local server, no api keys
        let version = "1.0.0";
        const details: Record<string, any> = { executablePath: exe, host: "localhost:11434" };
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
                const listRes = spawnSync(exe, ["list"], { encoding: "utf8", timeout: 1000 });
                if (listRes.status === 0) {
                    details.serverReachable = true;
                    details.models = listRes.stdout.split("\n").filter(Boolean);
                } else {
                    details.serverReachable = false;
                    details.serverError = listRes.stderr || `Exit code ${listRes.status}`;
                }
            }
        } catch (err: any) {
            details.error = err.message;
        }

        const latencyMs = Date.now() - startTime;
        const status: ProviderHealthReport["status"] = installed && details.serverReachable ? "Healthy" : (installed ? "Degraded" : "Offline");

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
        const exe = resolveOllamaPath();
        const prompt = buildPrompt({ task, context });

        // Ollama execution args: e.g. "ollama run model prompt"
        const model = context.selectedModel || this.metadata().defaultModel;

        return executeProviderTask(task, context, onEvent, onStream, {
            providerId: this.id,
            executablePath: exe,
            args: ["run", model, prompt],
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
