// ──────────────────────────────────────────────────────────────────────────────
// BUILD-049 — Ollama Provider (deterministic adapter stub)
// Local model via Ollama. No HTTP in tests.
// ──────────────────────────────────────────────────────────────────────────────
import { BaseSDKProvider } from "../../provider-runtime/provider";
const CAPABILITIES = ["analyze", "create", "modify", "refactor", "cleanup"];
export class OllamaProvider extends BaseSDKProvider {
    id = "ollama";
    name = "Ollama";
    metadata() {
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
    profile() {
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
    /**
     * Health check — detects local Ollama server on :11434.
     * In test mode, returns Degraded (no real HTTP check).
     */
    async health() {
        return {
            status: "Degraded", // Would be Healthy if server reachable
            authenticated: true,
            installed: false,
            latencyMs: 0,
            lastHeartbeat: new Date().toISOString(),
            version: this.metadata().version,
            details: {
                note: "Deterministic stub — no real Ollama server check",
                host: "localhost:11434"
            }
        };
    }
    async execute(task, context, onEvent, onStream) {
        onEvent({ type: "TaskStarted", taskId: task.id, timestamp: new Date().toISOString(), payload: {} });
        if (onStream) {
            onStream({ type: "Status", taskId: task.id, timestamp: new Date().toISOString(), status: "Running local model..." });
            onStream({ type: "Completed", taskId: task.id, timestamp: new Date().toISOString() });
        }
        onEvent({ type: "TaskCompleted", taskId: task.id, timestamp: new Date().toISOString(), payload: {} });
        return {
            taskId: task.id,
            status: "Completed",
            artifacts: [{
                    id: `ollama-${task.id}`,
                    taskId: task.id,
                    type: "code",
                    path: task.file,
                    content: `// Ollama (qwen2.5-coder) — ${task.title}\nexport {};`,
                    metadata: { provider: this.id, model: "qwen2.5-coder" },
                    createdAt: new Date().toISOString(),
                    provider: this.id
                }],
            metrics: {
                provider: this.id, capability: task.type, executionTime: 0, retries: 0,
                artifactsProduced: 1, eventsEmitted: 1, taskCount: 1,
                cancellationCount: 0, pauseCount: 0, resumeCount: 0
            }
        };
    }
}
