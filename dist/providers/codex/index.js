// ──────────────────────────────────────────────────────────────────────────────
// BUILD-049 — Codex Provider (deterministic adapter stub)
// OpenAI Codex CLI integration. No HTTP/subprocess in tests.
// ──────────────────────────────────────────────────────────────────────────────
import { BaseSDKProvider } from "../../provider-runtime/provider";
const CAPABILITIES = [
    "analyze", "create", "modify", "refactor", "validate", "test", "cleanup"
];
export class CodexProvider extends BaseSDKProvider {
    id = "codex";
    name = "Codex";
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
        const authenticated = !!process.env.OPENAI_API_KEY;
        return {
            status: authenticated ? "Healthy" : "Degraded",
            authenticated,
            installed: false,
            latencyMs: 0,
            lastHeartbeat: new Date().toISOString(),
            version: this.metadata().version,
            details: { note: "Deterministic stub — no real CLI invocation" }
        };
    }
    async execute(task, context, onEvent, onStream) {
        onEvent({ type: "TaskStarted", taskId: task.id, timestamp: new Date().toISOString(), payload: {} });
        if (onStream) {
            onStream({ type: "Status", taskId: task.id, timestamp: new Date().toISOString(), status: "Running codex..." });
            onStream({ type: "Completed", taskId: task.id, timestamp: new Date().toISOString() });
        }
        onEvent({ type: "TaskCompleted", taskId: task.id, timestamp: new Date().toISOString(), payload: {} });
        return {
            taskId: task.id,
            status: "Completed",
            artifacts: [{
                    id: `codex-${task.id}`,
                    taskId: task.id,
                    type: "code",
                    path: task.file,
                    content: `// Codex — ${task.title}\n// Model: o3\nexport {};`,
                    metadata: { provider: this.id, model: "o3" },
                    createdAt: new Date().toISOString(),
                    provider: this.id
                }],
            metrics: {
                provider: this.id,
                capability: task.type,
                executionTime: 0,
                retries: 0,
                artifactsProduced: 1,
                eventsEmitted: 1,
                taskCount: 1,
                cancellationCount: 0,
                pauseCount: 0,
                resumeCount: 0
            }
        };
    }
}
