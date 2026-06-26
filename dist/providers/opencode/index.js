// ──────────────────────────────────────────────────────────────────────────────
// BUILD-049 — OpenCode Provider (deterministic adapter stub)
// ──────────────────────────────────────────────────────────────────────────────
import { BaseSDKProvider } from "../../provider-runtime/provider";
const CAPABILITIES = ["create", "modify", "refactor", "test", "cleanup"];
export class OpenCodeProvider extends BaseSDKProvider {
    id = "opencode";
    name = "OpenCode";
    metadata() {
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
    profile() {
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
            tags: ["open-source", "lightweight"]
        };
    }
    async execute(task, context, onEvent, onStream) {
        onEvent({ type: "TaskStarted", taskId: task.id, timestamp: new Date().toISOString(), payload: {} });
        if (onStream) {
            onStream({ type: "Completed", taskId: task.id, timestamp: new Date().toISOString() });
        }
        onEvent({ type: "TaskCompleted", taskId: task.id, timestamp: new Date().toISOString(), payload: {} });
        return {
            taskId: task.id,
            status: "Completed",
            artifacts: [{
                    id: `opencode-${task.id}`,
                    taskId: task.id,
                    type: "code",
                    path: task.file,
                    content: `// OpenCode — ${task.title}\nexport {};`,
                    metadata: { provider: this.id },
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
