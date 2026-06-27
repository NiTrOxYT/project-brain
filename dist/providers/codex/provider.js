// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050C — Codex Provider — Provider Implementation
// ──────────────────────────────────────────────────────────────────────────────
import { spawnSync } from "child_process";
import { BaseSDKProvider } from "../../provider-runtime/provider.js";
import { ProviderExecutionService } from "../../provider-execution/service.js";
import { resolveExecutablePath, getStandardMockContent } from "../shared-resolver.js";
import { executeProviderTask } from "../shared-executor.js";
import { buildPrompt } from "./prompt-builder.js";
import { parseResponse } from "./response-parser.js";
const CAPABILITIES = [
    "analyze", "create", "modify", "refactor", "validate", "test", "cleanup"
];
const MOCK_CONTENT = getStandardMockContent("Codex", "hello world from codex");
export function resolveCodexPath() {
    return resolveExecutablePath("codex", "CODEX_BIN", MOCK_CONTENT);
}
export class CodexProvider extends BaseSDKProvider {
    id = "codex";
    name = "Codex";
    execService;
    cancelledTasks = new Set();
    constructor(execService) {
        super();
        this.execService = execService || new ProviderExecutionService();
    }
    metadata() {
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
    profile() {
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
    async health() {
        const exe = resolveCodexPath();
        let installed = false;
        let authenticated = false;
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
            if (installed) {
                const statusRes = spawnSync(exe, ["status"], { encoding: "utf8", timeout: 1000 });
                if (statusRes.status === 0) {
                    authenticated = true;
                    details.statusOutput = statusRes.stdout.trim();
                }
                else {
                    details.statusError = statusRes.stderr || `Exit code ${statusRes.status}`;
                }
            }
        }
        catch (err) {
            details.error = err.message;
        }
        if (!authenticated && process.env.OPENAI_API_KEY) {
            authenticated = true;
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
        const exe = resolveCodexPath();
        const prompt = buildPrompt({ task, context });
        const env = {};
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
    async cancel(taskId) {
        this.cancelledTasks.add(taskId);
        this.execService.cancel(taskId);
    }
}
