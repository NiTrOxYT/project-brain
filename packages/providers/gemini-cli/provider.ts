// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050C — Gemini CLI Provider — Provider Implementation
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

const CAPABILITIES: AgentCapability[] = [
    "analyze", "create", "modify", "refactor", "validate", "document", "test", "cleanup"
];

const MOCK_CONTENT = getStandardMockContent("Gemini CLI", "hello world from gemini");

export function resolveGeminiPath(): string {
    return resolveExecutablePath("gemini", "GEMINI_BIN", MOCK_CONTENT);
}

export class GeminiCLIProvider extends BaseSDKProvider {
    readonly id = "gemini-cli";
    readonly name = "Gemini CLI";
    private readonly execService: ProviderExecutionService;
    private readonly cancelledTasks = new Set<string>();

    constructor(execService?: ProviderExecutionService) {
        super();
        this.execService = execService || new ProviderExecutionService();
    }

    metadata(): ProviderMetadata {
        return {
            id: this.id,
            displayName: "Gemini CLI (Google)",
            version: "1.0.0",
            vendor: "Google",
            priority: 85,
            supportedCapabilities: CAPABILITIES,
            supportedLanguages: ["typescript", "javascript", "python", "go", "java", "kotlin", "dart"],
            supportedModels: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
            defaultModel: "gemini-2.5-pro",
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
                maxContextTokens: 1_000_000,
                maxOutputTokens: 64_000,
                maxParallelTasks: 2,
                supportsStreaming: true,
                supportsImages: true,
                supportsTools: true,
                supportsSessions: false,
                supportsCancellation: true
            },
            pricing: {
                promptTokenCostPer1k: 0.00125,
                completionTokenCostPer1k: 0.005,
                currency: "USD"
            },
            tags: ["long-context", "multimodal"]
        };
    }

    async health(): Promise<ProviderHealthReport> {
        const exe = resolveGeminiPath();
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

        if (!authenticated && (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY)) {
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
        const exe = resolveGeminiPath();
        const prompt = buildPrompt({ task, context });

        const env: Record<string, string> = {};
        if (process.env.GOOGLE_API_KEY) {
            env.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
        }
        if (process.env.GEMINI_API_KEY) {
            env.GEMINI_API_KEY = process.env.GEMINI_API_KEY;
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
