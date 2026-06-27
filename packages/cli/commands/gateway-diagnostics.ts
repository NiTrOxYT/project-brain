import type { KernelContext } from "../../kernel/index.js";
import { logger } from "../utils/logger.js";
import { IntegrationRegistry } from "../../provider-bridge/registry.js";
import { DefaultIntegrationManager } from "../../provider-bridge/manager.js";
import { IntegrationNegotiator } from "../../provider-bridge/negotiator.js";
import type { RuntimeEnvironment, IntegrationDescriptor } from "../../provider-bridge/integration.js";

export async function runGatewayIntegrationDiagnostics(
    ctx: KernelContext,
    opts: Record<string, any>
): Promise<void> {

    // Build the runtime environment to display features
    const manager = new DefaultIntegrationManager();
    // Use an internal helper or simulate feature discovery to display features
    const operatingSystem = process.platform === "darwin" ? "macos" :
                            process.platform === "win32" ? "windows" : "linux";

    const features = new Set<string>();
    if (process.stdout.isTTY) {
        features.add("tty");
        features.add("terminal");
    }
    
    // Simple git and docker check
    const { execSync } = await import("child_process");
    try {
        execSync("git --version", { stdio: "ignore" });
        features.add("git");
    } catch {}
    try {
        execSync("docker --version", { stdio: "ignore" });
        features.add("docker");
    } catch {}

    const env: RuntimeEnvironment = {
        operatingSystem,
        features,
        providerVersion: "1.0.0"
    };

    logger.log("🧠 \x1b[1mProject Brain — Provider Integration Diagnostics\x1b[0m\n");
    logger.log(`Runtime Environment Features:`);
    logger.log(`  OS       : ${env.operatingSystem}`);
    logger.log(`  Features : ${Array.from(env.features).join(", ")}\n`);

    // Group descriptors by providerId
    const descriptors = IntegrationRegistry.list();
    const providers = Array.from(new Set(descriptors.map(d => d.providerId)));

    for (const providerId of providers) {
        logger.log(`-----------------------------------`);
        logger.log(`Provider: \x1b[1m${providerId}\x1b[0m`);
        logger.log(`Detected Integrations`);

        const matches = descriptors.filter(d => d.providerId === providerId);
        
        for (const desc of matches) {
            const support = await desc.supports(env);
            const statusSymbol = support.supported ? "✓" : "✗";
            const colorSymbol = support.supported ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
            logger.log(`${colorSymbol} ${desc.transport === "launch-wrapper" ? "Launch Wrapper" : desc.transport.toUpperCase()}`);
            logger.log(`  Priority: ${desc.priority}`);
            if (!support.supported) {
                logger.log(`  Reason:`);
                logger.log(`  ${support.reason || "Transport not supported in current environment"}`);
            }
        }

        // Get selected
        const selectedDesc = await IntegrationNegotiator.negotiate(providerId, env);
        if (selectedDesc) {
            logger.log(`\x1b[1mSelected\x1b[0m`);
            logger.log(`${selectedDesc.transport === "launch-wrapper" ? "Launch Wrapper" : selectedDesc.transport.toUpperCase()}`);
            logger.log(`\x1b[1mReason\x1b[0m`);
            logger.log(`Highest supported priority.`);
        } else {
            logger.log(`\x1b[1mSelected\x1b[0m`);
            logger.log(`None`);
        }
    }
    logger.log(`-----------------------------------`);

    // Context Provider Telemetry Diagnostics
    const { ContextProvider } = await import("../../context-provider/provider.js");
    const tel = ContextProvider.getTelemetry();
    const avoidanceRate = ContextProvider.getScanAvoidanceRate() * 100;
    const cacheHitRate = ContextProvider.getCacheHitRate() * 100;
    const fallbackRate = ContextProvider.getFallbackRate() * 100;
    const satisfactionRate = ContextProvider.getSatisfactionRate() * 100;

    logger.log(`\n🧠 \x1b[1mProject Brain — Context Provider Diagnostics\x1b[0m\n`);
    logger.log(`  Context Provider  : \x1b[32menabled\x1b[0m`);
    logger.log(`  Cache Status      : Active`);
    logger.log(`  Snapshot Status   : Stored`);
    logger.log(`  Requests Served   : ${tel.requestsServed}`);
    logger.log(`  Served Directly   : ${tel.requestsServedDirectly}`);
    logger.log(`  Fallback Scans    : ${tel.repositoryFallbackCount}`);
    logger.log(`  Scan Avoidance    : ${avoidanceRate.toFixed(1)}%`);
    logger.log(`  Cache Hit Rate    : ${cacheHitRate.toFixed(1)}%`);
    logger.log(`  Fallback Rate     : ${fallbackRate.toFixed(1)}%`);
    logger.log(`  Satisfaction Rate : ${satisfactionRate.toFixed(1)}%`);
    logger.log(`  Avg Latency       : ${tel.requestsServed > 0 ? (tel.totalLatencyMs / tel.requestsServed).toFixed(1) : 0}ms`);
    logger.log(`  Saved Tokens      : ${tel.totalSavedTokens}`);
    logger.log(`  Avg Confidence    : ${(tel.averageConfidence * 100).toFixed(1)}%`);
    logger.log(`-----------------------------------`);
}
