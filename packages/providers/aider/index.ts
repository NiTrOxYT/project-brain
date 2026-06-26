// ──────────────────────────────────────────────────────────────────────────────
// BUILD-049 — Aider Provider (deterministic adapter stub)
// ──────────────────────────────────────────────────────────────────────────────

import { RuntimeTask, RuntimeContext, RuntimeResponse, RuntimeEvent, AgentCapability } from "../../agent-runtime/types";
import { BaseSDKProvider } from "../../provider-runtime/provider";
import { ProviderMetadata, ProviderProfile, StreamEvent } from "../../provider-runtime/types";

const CAPABILITIES: AgentCapability[] = ["modify", "refactor", "test", "cleanup"];

export class AiderProvider extends BaseSDKProvider {
    readonly id = "aider";
    readonly name = "Aider";

    metadata(): ProviderMetadata {
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
            supportsCancellation: false,
            supportsPauseResume: false,
            runtimeCompatibility: "1.0.0"
        };
    }

    profile(): ProviderProfile {
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
                supportsCancellation: false
            },
            tags: ["open-source", "git-aware"]
        };
    }

    async execute(
        task: RuntimeTask,
        context: RuntimeContext,
        onEvent: (event: RuntimeEvent) => void,
        onStream?: (event: StreamEvent) => void
    ): Promise<RuntimeResponse> {
        onEvent({ type: "TaskStarted", taskId: task.id, timestamp: new Date().toISOString(), payload: {} });
        onEvent({ type: "TaskCompleted", taskId: task.id, timestamp: new Date().toISOString(), payload: {} });
        return {
            taskId: task.id,
            status: "Completed",
            artifacts: [{
                id: `aider-${task.id}`,
                taskId: task.id,
                type: "code",
                path: task.file,
                content: `# Aider — ${task.title}\n# Type: ${task.type}`,
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
