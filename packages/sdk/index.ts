// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — SDK Package — Stable Boundaries
// The only entry point for CLI, IDE extensions, and MCP servers.
// ──────────────────────────────────────────────────────────────────────────────

import { createKernelContext as baseCreateKernelContext } from "../kernel/index.js";
import type { KernelContext } from "../kernel/index.js";
import { AiGatewayService }                  from "../ai-gateway/service.js";
import { GatewaySessionStore }               from "../ai-gateway/session.js";
import { GatewayMetricsStore }               from "../ai-gateway/metrics.js";
import { GatewayHistory }                    from "../ai-gateway/history.js";
import type { GatewaySession, AggregateMetrics } from "../domain/index.js";
import { AdapterRegistry } from "../ai-gateway/adapter-registry.js";

// Ensure all adapters are imported and registered statically first
import "../ai-gateway/adapters/index.js";

export function createKernelContext(
    projectRoot:   string,
    workspaceRoot: string
): KernelContext {
    const ctx = baseCreateKernelContext(projectRoot, workspaceRoot);
    const adapters = AdapterRegistry.list();
    for (const a of adapters) {
        ctx.plugins.registerSync(a as any);
    }
    return ctx;
}
export type { KernelContext } from "../kernel/index.js";

// Re-export event catalog & manager
export { Events } from "../kernel/events.js";
export type { GatewayEventKind, GatewayEvent } from "../kernel/events.js";

// Re-export shared domain models
export type {
    TimelineEntry,
    PromptDiffChunk,
    PromptDiff,
    GatewaySessionMetrics,
    SessionOutcome,
    GatewaySession,
    ProviderHealthStatus,
    ProviderRegistration,
    GlobalConfig,
    ProviderStats,
    AggregateMetrics,
    GatewayDiagnosticReport,
} from "../domain/index.js";

// ─── Gateway Operations ───────────────────────────────────────────────────────

/**
 * Execute a provider session via the AI Gateway pipeline.
 */
export async function runGatewaySession(
    ctx:            KernelContext,
    providerId:     string,
    originalPrompt: string,
    extraArgs:      string[]
): Promise<GatewaySession> {
    const service = new AiGatewayService(
        ctx.projectRoot,
        ctx.workspaceRoot,
        ctx.eventBus as any,
        new GatewaySessionStore(ctx.globalPaths),
        new GatewayMetricsStore(ctx.globalPaths)
    );
    return await service.run(providerId, originalPrompt, extraArgs);
}

// ─── Metrics & History ────────────────────────────────────────────────────────

/**
 * Load global aggregate metrics.
 */
export async function getGatewayMetrics(ctx: KernelContext): Promise<AggregateMetrics> {
    const store = new GatewayMetricsStore(ctx.globalPaths);
    return store.load();
}

/**
 * Fetch recent sessions.
 */
export async function queryGatewayHistory(
    ctx:   KernelContext,
    limit: number
): Promise<GatewaySession[]> {
    const store = new GatewaySessionStore(ctx.globalPaths);
    const history = new GatewayHistory(store);
    return history.query({ limit });
}

/**
 * Find a specific session by ID.
 */
export async function findSessionById(
    ctx:       KernelContext,
    sessionId: string
): Promise<GatewaySession | null> {
    const store = new GatewaySessionStore(ctx.globalPaths);
    return store.findById(sessionId) ?? null;
}

// ─── Installer ────────────────────────────────────────────────────────────────

import { BrainInstaller, type InstallerRunOptions, type InstallerResult } from "../installer/index.js";

export interface SdkInstallOptions {
    dryRun?:      boolean;
    repair?:      boolean;
    uninstall?:   boolean;
    providerId?:  string;
    interactive?: boolean;
    binDir?:      string;
}

/**
 * Discovers providers and installs transparent interceptor shims.
 * Routes to the BUILD-061D self-healing installer engine.
 */
export async function runGatewayInstaller(
    ctx:  KernelContext,
    opts: SdkInstallOptions
): Promise<InstallerResult> {
    const installer = new BrainInstaller(ctx);
    return await installer.install(opts as InstallerRunOptions);
}

export type { InstallerResult };

