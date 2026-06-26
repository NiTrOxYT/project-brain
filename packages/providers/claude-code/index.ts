// ──────────────────────────────────────────────────────────────────────────────
// BUILD-049 — Claude Code Provider (deterministic adapter stub)
// Anthropic Claude Code CLI integration. No HTTP/subprocess in tests.
// ──────────────────────────────────────────────────────────────────────────────

import { RuntimeTask, RuntimeContext, RuntimeResponse, RuntimeEvent, AgentCapability } from "../../agent-runtime/types";
import { BaseSDKProvider } from "../../provider-runtime/provider";
import { ProviderMetadata, ProviderProfile, ProviderHealthReport, StreamEvent } from "../../provider-runtime/types";

const CAPABILITIES: AgentCapability[] = [
    "analyze", "create", "modify", "refactor", "validate", "document", "test", "cleanup"
];

export class ClaudeCodeProvider extends BaseSDKProvider {
    readonly id = "claude-code";
    readonly name = "Claude Code";

    metadata(): ProviderMetadata {
        return {
            id: this.id,
            displayName: "Claude Code (Anthropic)",
            version: "1.0.0",
            vendor: "Anthropic",
            priority: 100,
            supportedCapabilities: CAPABILITIES,
            supportedLanguages: ["typescript", "javascript", "python", "go", "rust", "java", "c++"],
            supportedModels: ["claude-sonnet-4-5", "claude-opus-4", "claude-haiku-4"],
            defaultModel: "claude-sonnet-4-5",
            supportsStreaming: true,
            supportsSessions: true,
            supportsCancellation: true,
            supportsPauseResume: false,
            runtimeCompatibility: "1.0.0"
        };
    }

    profile(): ProviderProfile {
        return {
            metadata: this.metadata(),
            limits: {
                maxContextTokens: 200_000,
                maxOutputTokens: 64_000,
                maxParallelTasks: 1,
                supportsStreaming: true,
                supportsImages: true,
                supportsTools: true,
                supportsSessions: true,
                supportsCancellation: true
            },
            pricing: {
                promptTokenCostPer1k: 0.003,
                completionTokenCostPer1k: 0.015,
                currency: "USD"
            },
            tags: ["flagship", "coding", "reasoning"]
        };
    }

    /**
     * Health check — detects 'claude' CLI or ANTHROPIC_API_KEY.
     * Returns Degraded if neither found (no subprocess execution in tests).
     */
    async health(): Promise<ProviderHealthReport> {
        const authenticated = !!process.env.ANTHROPIC_API_KEY;
        const status = authenticated ? "Healthy" : "Degraded";
        return {
            status,
            authenticated,
            installed: false, // CLI detection skipped in test mode
            latencyMs: 0,
            lastHeartbeat: new Date().toISOString(),
            version: this.metadata().version,
            details: { note: "Deterministic stub — no real CLI invocation" }
        };
    }

    async execute(
        task: RuntimeTask,
        context: RuntimeContext,
        onEvent: (event: RuntimeEvent) => void,
        onStream?: (event: StreamEvent) => void
    ): Promise<RuntimeResponse> {
        onEvent({ type: "TaskStarted", taskId: task.id, timestamp: new Date().toISOString(), payload: {} });

        if (onStream) {
            onStream({ type: "Status", taskId: task.id, timestamp: new Date().toISOString(), status: "Queuing claude code..." });
            onStream({ type: "Reasoning", taskId: task.id, timestamp: new Date().toISOString(), message: `Analyzing ${task.type} task: ${task.title}` });
            onStream({ type: "Progress", taskId: task.id, timestamp: new Date().toISOString(), progress: 100 });
            onStream({ type: "Completed", taskId: task.id, timestamp: new Date().toISOString() });
        }

        onEvent({ type: "TaskCompleted", taskId: task.id, timestamp: new Date().toISOString(), payload: {} });

        return {
            taskId: task.id,
            status: "Completed",
            artifacts: [{
                id: `claude-${task.id}`,
                taskId: task.id,
                type: "code",
                path: task.file,
                content: `// Claude Code — ${task.title}\n// Model: claude-sonnet-4-5\n// Task type: ${task.type}\nexport {};`,
                metadata: { provider: this.id, model: "claude-sonnet-4-5" },
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
