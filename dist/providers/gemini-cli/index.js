// ──────────────────────────────────────────────────────────────────────────────
// BUILD-049 — Gemini CLI Provider (deterministic adapter stub)
// Google Gemini CLI integration. No HTTP/subprocess in tests.
// ──────────────────────────────────────────────────────────────────────────────
import { BaseSDKProvider } from "../../provider-runtime/provider";
const CAPABILITIES = [
    "analyze", "create", "modify", "refactor", "validate", "document", "test", "cleanup"
];
export class GeminiCLIProvider extends BaseSDKProvider {
    id = "gemini-cli";
    name = "Gemini CLI";
    metadata() {
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
    profile() {
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
    async health() {
        const authenticated = !!process.env.GOOGLE_API_KEY || !!process.env.GEMINI_API_KEY;
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
            onStream({ type: "Status", taskId: task.id, timestamp: new Date().toISOString(), status: "Running gemini..." });
            onStream({ type: "Completed", taskId: task.id, timestamp: new Date().toISOString() });
        }
        onEvent({ type: "TaskCompleted", taskId: task.id, timestamp: new Date().toISOString(), payload: {} });
        return {
            taskId: task.id,
            status: "Completed",
            artifacts: [{
                    id: `gemini-${task.id}`,
                    taskId: task.id,
                    type: "code",
                    path: task.file,
                    content: `// Gemini CLI — ${task.title}\n// Model: gemini-2.5-pro\nexport {};`,
                    metadata: { provider: this.id, model: "gemini-2.5-pro" },
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
