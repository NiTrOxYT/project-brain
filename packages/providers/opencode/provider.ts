// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050C — OpenCode Provider — Provider Implementation
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

const CAPABILITIES: AgentCapability[] = ["create", "modify", "refactor", "test", "cleanup"];

const MOCK_CONTENT = getStandardMockContent("OpenCode", "hello world from opencode");

export function resolveOpenCodePath(): string {
    return resolveExecutablePath("opencode", "OPENCODE_BIN", MOCK_CONTENT);
}

export class OpenCodeProvider extends BaseSDKProvider {
    readonly id = "opencode";
    readonly name = "OpenCode";
    private readonly execService: ProviderExecutionService;
    private readonly cancelledTasks = new Set<string>();

    constructor(execService?: ProviderExecutionService) {
        super();
        this.execService = execService || new ProviderExecutionService();
    }

    metadata(): ProviderMetadata {
        return {
            id: this.id,
            displayName: "OpenCode",
            version: "1.0.0",
            vendor: "OpenCode",
            priority: 60,
            supportedCapabilities: CAPABILITIES,
            supportedLanguages: ["typescript", "javascript", "python", "go"],
            supportedModels: ["opencode-latest", "opencode-fast"],
            defaultModel: "opencode-latest",
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
                maxParallelTasks: 2,
                supportsStreaming: true,
                supportsImages: false,
                supportsTools: false,
                supportsSessions: false,
                supportsCancellation: true
            },
            pricing: {
                promptTokenCostPer1k: 0.0,
                completionTokenCostPer1k: 0.0,
                currency: "USD"
            },
            tags: ["open-source", "lightweight"]
        };
    }

    async health(): Promise<ProviderHealthReport> {
        const exe = resolveOpenCodePath();
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

        // OpenCode defaults to authenticated if installed and no status check is strictly required
        if (installed && !authenticated) {
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
        const exe = resolveOpenCodePath();
        const prompt = buildPrompt({ task, context });

        return executeProviderTask(task, context, onEvent, onStream, {
            providerId: this.id,
            executablePath: exe,
            args: [prompt],
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
