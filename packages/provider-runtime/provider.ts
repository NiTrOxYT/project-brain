// ──────────────────────────────────────────────────────────────────────────────
// BUILD-049 — Provider Runtime — Provider Interface & Base Class
// ──────────────────────────────────────────────────────────────────────────────

import { RuntimeTask, RuntimeContext, RuntimeResponse, RuntimeEvent } from "../agent-runtime/types.js";
import { AgentCapability } from "../agent-runtime/types.js";
import {
    ProviderMetadata,
    ProviderProfile,
    ProviderHealthReport,
    StreamEvent
} from "./types.js";

// ─── SDKProvider Interface ────────────────────────────────────────────────────

/**
 * Every provider must implement this interface.
 * No provider-specific methods may appear in any other package.
 * Providers never write to the filesystem — only return RuntimeArtifact[].
 */
export interface SDKProvider {
    /** Unique stable identifier. */
    readonly id: string;

    /** Human-readable display name. */
    readonly name: string;

    /** Static metadata — never changes at runtime. */
    metadata(): ProviderMetadata;

    /** Full profile including limits and pricing. */
    profile(): ProviderProfile;

    /** All capabilities this provider supports. */
    capabilities(): AgentCapability[];

    /** Live health check. Must be fast and non-blocking. */
    health(): Promise<ProviderHealthReport>;

    /**
     * Execute a runtime task.
     * Must return RuntimeResponse with RuntimeArtifact[].
     * Must never write to the filesystem directly.
     */
    execute(
        task: RuntimeTask,
        context: RuntimeContext,
        onEvent: (event: RuntimeEvent) => void,
        onStream?: (event: StreamEvent) => void
    ): Promise<RuntimeResponse>;

    /** Pause an in-flight task (no-op if not supported). */
    pause(taskId: string): Promise<void>;

    /** Resume a paused task (no-op if not supported). */
    resume(taskId: string): Promise<void>;

    /** Cancel a task immediately. */
    cancel(taskId: string): Promise<void>;

    /** Graceful shutdown — release resources. */
    shutdown(): Promise<void>;

    /** Whether this provider supports the given capability. */
    supportsCapability(capability: AgentCapability): boolean;
}

// ─── BaseSDKProvider ──────────────────────────────────────────────────────────

/**
 * Abstract base implementing shared boilerplate.
 * Concrete providers extend this and implement:
 *   - metadata()
 *   - profile()
 *   - execute()
 * Other methods have sensible defaults.
 */
export abstract class BaseSDKProvider implements SDKProvider {
    abstract readonly id: string;
    abstract readonly name: string;

    abstract metadata(): ProviderMetadata;
    abstract profile(): ProviderProfile;

    capabilities(): AgentCapability[] {
        return this.metadata().supportedCapabilities;
    }

    supportsCapability(capability: AgentCapability): boolean {
        return this.capabilities().includes(capability);
    }

    async health(): Promise<ProviderHealthReport> {
        return {
            status: "Healthy",
            authenticated: true,
            installed: true,
            latencyMs: 0,
            lastHeartbeat: new Date().toISOString(),
            version: this.metadata().version
        };
    }

    abstract execute(
        task: RuntimeTask,
        context: RuntimeContext,
        onEvent: (event: RuntimeEvent) => void,
        onStream?: (event: StreamEvent) => void
    ): Promise<RuntimeResponse>;

    async pause(_taskId: string): Promise<void> {}
    async resume(_taskId: string): Promise<void> {}
    async cancel(_taskId: string): Promise<void> {}
    async shutdown(): Promise<void> {}
}
