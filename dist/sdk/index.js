// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — SDK Package — Stable Boundaries
// The only entry point for CLI, IDE extensions, and MCP servers.
// ──────────────────────────────────────────────────────────────────────────────
import { createKernelContext as baseCreateKernelContext } from "../kernel/index.js";
import { AiGatewayService } from "../ai-gateway/service.js";
import { GatewaySessionStore } from "../ai-gateway/session.js";
import { GatewayMetricsStore } from "../ai-gateway/metrics.js";
import { GatewayHistory } from "../ai-gateway/history.js";
import { AdapterRegistry } from "../ai-gateway/adapter-registry.js";
// Ensure all adapters are imported and registered statically first
import "../ai-gateway/adapters/index.js";
export function createKernelContext(projectRoot, workspaceRoot) {
    const ctx = baseCreateKernelContext(projectRoot, workspaceRoot);
    const adapters = AdapterRegistry.list();
    for (const a of adapters) {
        ctx.plugins.registerSync(a);
    }
    return ctx;
}
// Re-export event catalog & manager
export { Events } from "../kernel/events.js";
// ─── Gateway Operations ───────────────────────────────────────────────────────
/**
 * Execute a provider session via the AI Gateway pipeline.
 */
export async function runGatewaySession(ctx, providerId, originalPrompt, extraArgs) {
    const service = new AiGatewayService(ctx.projectRoot, ctx.workspaceRoot, ctx.eventBus, new GatewaySessionStore(ctx.globalPaths), new GatewayMetricsStore(ctx.globalPaths));
    return await service.run(providerId, originalPrompt, extraArgs);
}
// ─── Metrics & History ────────────────────────────────────────────────────────
/**
 * Load global aggregate metrics.
 */
export async function getGatewayMetrics(ctx) {
    const store = new GatewayMetricsStore(ctx.globalPaths);
    return store.load();
}
/**
 * Fetch recent sessions.
 */
export async function queryGatewayHistory(ctx, limit) {
    const store = new GatewaySessionStore(ctx.globalPaths);
    const history = new GatewayHistory(store);
    return history.query({ limit });
}
/**
 * Find a specific session by ID.
 */
export async function findSessionById(ctx, sessionId) {
    const store = new GatewaySessionStore(ctx.globalPaths);
    return store.findById(sessionId) ?? null;
}
// ─── Installer ────────────────────────────────────────────────────────────────
import { BrainInstaller } from "../installer/index.js";
/**
 * Discovers providers and installs transparent interceptor shims.
 * Routes to the BUILD-061D self-healing installer engine.
 */
export async function runGatewayInstaller(ctx, opts) {
    const installer = new BrainInstaller(ctx);
    return await installer.install(opts);
}
import { ProviderResolverService } from "../ai-gateway/provider-resolver.js";
export async function resolveProvider(ctx, providerId) {
    const resolver = new ProviderResolverService(ctx.globalPaths);
    return await resolver.resolve(providerId);
}
