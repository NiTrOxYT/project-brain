// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050C — Aider Provider — Provider Implementation
// ──────────────────────────────────────────────────────────────────────────────
import { spawnSync } from "child_process";
import { BaseSDKProvider } from "../../provider-runtime/provider.js";
import { ProviderExecutionService } from "../../provider-execution/service.js";
import { resolveExecutablePath, getStandardMockContent } from "../shared-resolver.js";
import { executeProviderTask } from "../shared-executor.js";
import { buildPrompt } from "./prompt-builder.js";
import { parseResponse } from "./response-parser.js";
const CAPABILITIES = ["modify", "refactor", "test", "cleanup"];
const MOCK_CONTENT = getStandardMockContent("Aider", "hello world from aider");
export function resolveAiderPath() {
    return resolveExecutablePath("aider", "AIDER_BIN", MOCK_CONTENT);
}
export class AiderProvider extends BaseSDKProvider {
    id = "aider";
    name = "Aider";
    execService;
    cancelledTasks = new Set();
    constructor(execService) {
        super();
        this.execService = execService || new ProviderExecutionService();
    }
    metadata() {
        return {
            id: this.id,
            displayName: "Aider",
            version: "1.0.0",
            vendor: "Aider",
            priority: 50,
            supportedCapabilities: CAPABILITIES,
            supportedLanguages: ["python", "javascript", "typescript", "go", "rust"],
            supportedModels: ["aider-claude-sonnet", "aider-gpt4o", "aider-deepseek"],
            defaultModel: "aider-claude-sonnet",
            supportsStreaming: false,
            supportsSessions: false,
            supportsCancellation: true,
            supportsPauseResume: false,
            runtimeCompatibility: "1.0.0"
        };
    }
    profile() {
        return {
            metadata: this.metadata(),
            limits: {
                maxContextTokens: 64_000,
                maxOutputTokens: 16_000,
                maxParallelTasks: 1,
                supportsStreaming: false,
                supportsImages: false,
                supportsTools: false,
                supportsSessions: false,
                supportsCancellation: true
            },
            tags: ["open-source", "git-aware"]
        };
    }
    async health() {
        const exe = resolveAiderPath();
        let installed = false;
        let authenticated = true; // Local client
        let version = "1.0.0";
        const details = { executablePath: exe };
        const startTime = Date.now();
        try {
            const versionRes = spawnSync(exe, ["--version"], { encoding: "utf8", timeout: 1000 });
            if (versionRes.status === 0) {
                installed = true;
                const match = versionRes.stdout.match(/(\d+\.\d+\.\d+)/);
                if (match) {
                    version = match[1];
                }
            }
            else {
                details.versionError = versionRes.stderr || `Exit code ${versionRes.status}`;
            }
        }
        catch (err) {
            details.error = err.message;
        }
        const latencyMs = Date.now() - startTime;
        let status = "Offline";
        if (installed && authenticated) {
            status = "Healthy";
        }
        else if (installed) {
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
    async execute(task, context, onEvent, onStream) {
        const exe = resolveAiderPath();
        const prompt = buildPrompt({ task, context });
        return executeProviderTask(task, context, onEvent, onStream, {
            providerId: this.id,
            executablePath: exe,
            args: ["--message", prompt],
            cancelledTasks: this.cancelledTasks,
            execService: this.execService,
            parseResponse: (stdout) => parseResponse(stdout, task.id, this.id)
        });
    }
    async cancel(taskId) {
        this.cancelledTasks.add(taskId);
        this.execService.cancel(taskId);
    }
}
