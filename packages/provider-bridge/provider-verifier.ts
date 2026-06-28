// ──────────────────────────────────────────────────────────────────────────────
// BUILD-069 — Pluggable Strategy-Driven Provider Verification Engine
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { ProviderDiscoveryEngine } from "./discovery.js";
import { ProviderConfigurator } from "./provider-configurator.js";
import { ProviderSchemaRegistry } from "./schema-registry.js";
import { ProviderStrategyRegistry } from "./provider-strategy-registry.js";
import { ProviderProfileRegistry } from "./provider-profile.js";
import { ProviderLockRegistry } from "./provider-lock.js";
import { ProviderStateRegistry } from "./provider-state.js";
import { ProviderHealthRegistry } from "./provider-health.js";
import { ProviderEventLogger } from "./provider-events.js";
import { ProviderVerificationCache } from "./provider-cache.js";
import { ProviderCompatibilityRegistry } from "./provider-compatibility.js";
import { McpToolRegistry } from "../mcp-server/registry.js";
import { ContextProvider } from "../context-provider/provider.js";
import "./provider-integration.js";
import type { ProviderIntegrationContext } from "./provider-strategy-registry.js";

export type ProviderState =
    | "Not Installed"
    | "Unsupported Version"
    | "Installed"
    | "Configured"
    | "Brain Enabled"
    | "Brain Optimized"
    | "Verification Required"
    | "Configuration Drift Detected";

export interface VerificationResult {
    level1:  boolean;
    level2:  boolean;
    level3:  boolean;
    level4:  boolean;
    state:   ProviderState;
    stages: {
        installation:  "Passed" | "Failed";
        configuration: "Passed" | "Failed";
        connectivity:  "Passed" | "Failed" | "Skipped";
        behavioral:    "Passed" | "Failed" | "Skipped";
    };
    errors:  string[];
}

function getBrainVersion(workspaceRoot?: string): string {
    try {
        const root = workspaceRoot ?? process.cwd();
        const p = path.join(root, "package.json");
        if (fs.existsSync(p)) {
            const pkg = JSON.parse(fs.readFileSync(p, "utf-8"));
            return pkg.version ?? "0.1.0";
        }
    } catch {}
    return "0.1.0";
}

export class ProviderVerificationEngine {
    static async verify(providerId: string, workspaceRoot?: string): Promise<VerificationResult> {
        const errors: string[] = [];
        let level1 = false;
        let level2 = false;
        let level3 = false;
        let level4 = false;
        let state: ProviderState = "Not Installed";

        const stages: {
            installation:  "Passed" | "Failed";
            configuration: "Passed" | "Failed";
            connectivity:  "Passed" | "Failed" | "Skipped";
            behavioral:    "Passed" | "Failed" | "Skipped";
        } = {
            installation:  "Failed",
            configuration: "Failed",
            connectivity:  "Skipped",
            behavioral:    "Skipped"
        };

        const schema = ProviderSchemaRegistry.get(providerId);
        if (!schema) {
            errors.push(`Provider "${providerId}" has no registered configuration schema.`);
            return { level1, level2, level3, level4, state, stages, errors };
        }

        const config = ProviderDiscoveryEngine.discover(providerId, workspaceRoot);
        const manifest = schema.manifest;

        // ── Check Configuration Drift & Lock Invalidation ─────────────────────
        const lock = ProviderLockRegistry.get(providerId, workspaceRoot);
        if (lock) {
            const drift = ProviderLockRegistry.checkDrift(
                providerId,
                config.executable,
                config.version,
                lock.configurationFile,
                workspaceRoot
            );
            if (drift.drifted) {
                ProviderStateRegistry.invalidate(providerId, workspaceRoot);
                ProviderVerificationCache.invalidate(providerId, workspaceRoot);
                ProviderEventLogger.logEvent(providerId, "version changed", { reason: drift.reason }, workspaceRoot);
                state = "Configuration Drift Detected";
                errors.push(`Verification invalidated: ${drift.reason}`);
                // Continue to run verify to revalidate
            }
        }

        // ── Evaluate Verification Cache ──────────────────────────────────────
        const activeConfigPath = ProviderConfigurator.getConfigPath(providerId);
        const checksum = ProviderLockRegistry.calculateChecksum(activeConfigPath);
        const cacheKey = {
            providerVersion: config.version,
            brainVersion: getBrainVersion(workspaceRoot),
            configurationChecksum: checksum,
            schemaVersion: manifest.compatibility.supportedSchemaVersions[0] || "1.0.0"
        };

        const cached = ProviderVerificationCache.get(providerId, workspaceRoot);
        if (cached &&
            cached.providerVersion === cacheKey.providerVersion &&
            cached.brainVersion === cacheKey.brainVersion &&
            cached.configurationChecksum === cacheKey.configurationChecksum &&
            cached.schemaVersion === cacheKey.schemaVersion
        ) {
            // Cache hits, skip redundant checks
            return cached.verificationResult;
        }

        // ── Stage 1: Installation & Version ───────────────────────────────────
        if (!config.installed) {
            errors.push(`Provider "${providerId}" installation could not be detected.`);
            const result = { level1, level2, level3, level4, state, stages, errors };
            ProviderHealthRegistry.recordFailure(providerId, workspaceRoot);
            return result;
        }

        const compatRes = ProviderCompatibilityRegistry.validateCompatibility(manifest.compatibility, config.version);
        if (!compatRes.supported) {
            state = "Unsupported Version";
            stages.installation = "Failed";
            errors.push(compatRes.error || "Unsupported Provider Version");
            const result = { level1, level2, level3, level4, state, stages, errors };
            ProviderHealthRegistry.recordFailure(providerId, workspaceRoot);
            return result;
        }

        level1 = true;
        stages.installation = "Passed";
        state = "Installed";

        // ── Stage 2: Configuration ───────────────────────────────────────────
        const isConfigured = ProviderConfigurator.isConfigured(providerId, workspaceRoot);
        if (!isConfigured) {
            errors.push(`Brain MCP registration is missing in "${providerId}" configuration.`);
            const result = { level1, level2, level3, level4, state, stages, errors };
            ProviderHealthRegistry.recordFailure(providerId, workspaceRoot);
            return result;
        }

        const { path: activePath } = ProviderConfigurator.getActiveConfigPath(providerId, workspaceRoot);
        if (fs.existsSync(activePath)) {
            const content = fs.readFileSync(activePath, "utf-8");
            const schemaErr = schema.validate(content, activePath.includes("global"));
            if (schemaErr) {
                errors.push(`Schema validation failed for active config: ${schemaErr}`);
                const result = { level1, level2, level3, level4, state, stages, errors };
                ProviderHealthRegistry.recordFailure(providerId, workspaceRoot);
                return result;
            }
        }

        level2 = true;
        stages.configuration = "Passed";
        state = "Configured";

        // ── Stage 3: Connectivity & Handshake ─────────────────────────────────
        const selectedMode = config.selectedIntegrationMode;
        const supportsMcp = manifest.capabilities.supportsStdioMcp || manifest.capabilities.supportsHttpMcp;
        if (selectedMode !== "none" && supportsMcp) {
            stages.connectivity = "Failed";
            
            // Resolve integration strategy and execute verify check
            try {
                const strategy = ProviderStrategyRegistry.resolve(selectedMode);
                const profile = ProviderProfileRegistry.generateProfile(providerId, workspaceRoot);
                const context: ProviderIntegrationContext = {
                    manifest,
                    profile,
                    configuration: config,
                    activeConfigPath: activePath,
                    workspaceRoot
                };

                const strategyVerifyRes = await strategy.verify(context);
                if (!strategyVerifyRes.success) {
                    errors.push(...strategyVerifyRes.errors);
                    const result = { level1, level2, level3, level4, state, stages, errors };
                    ProviderHealthRegistry.recordFailure(providerId, workspaceRoot);
                    ProviderEventLogger.logEvent(providerId, "audit failed", { errors: strategyVerifyRes.errors }, workspaceRoot);
                    return result;
                }

                level3 = true;
                stages.connectivity = "Passed";
                state = "Brain Enabled";
                ProviderHealthRegistry.recordSuccess(providerId, "lastSuccessfulMcpHandshake", workspaceRoot);
            } catch (err: any) {
                errors.push(`Strategy verification error: ${err.message}`);
                const result = { level1, level2, level3, level4, state, stages, errors };
                ProviderHealthRegistry.recordFailure(providerId, workspaceRoot);
                return result;
            }
        } else {
            // Integration not supported natively - skip connectivity
            level3 = true;
            stages.connectivity = "Skipped";
            state = "Brain Enabled";
        }

        // ── Stage 4: Behavioral ───────────────────────────────────────────────
        if (manifest.capabilities.supportsBehaviorVerification) {
            stages.behavioral = "Failed";
            try {
                const tool = McpToolRegistry.get("brain.get_context");
                if (tool) {
                    const response = await tool.execute({
                        query: "verification query",
                        workspaceRoot,
                        snapshotId: "verification-snapshot-id",
                        maxTokens: 1000
                    });

                    if (response && typeof response.confidence === "number") {
                        level4 = true;
                        stages.behavioral = "Passed";
                        state = "Brain Optimized";

                        // Update telemetry
                        const tel = ContextProvider.getTelemetry();
                        tel.mcpConfigured = true;
                        tel.mcpConnected++;

                        ProviderHealthRegistry.recordSuccess(providerId, "lastSuccessfulToolInvocation", workspaceRoot);
                    } else {
                        errors.push("Behavior verification failed: brain.get_context returned invalid response structure.");
                    }
                } else {
                    errors.push("Required brain.get_context tool missing in registry.");
                }
            } catch (err: any) {
                errors.push(`Behavior verification error: ${err.message || err}`);
            }
        } else {
            level4 = true;
            stages.behavioral = "Skipped";
        }

        const finalResult: VerificationResult = { level1, level2, level3, level4, state, stages, errors };

        if (errors.length === 0) {
            // Save state & health logs on complete success
            ProviderHealthRegistry.recordSuccess(providerId, "lastSuccessfulVerification", workspaceRoot);
            ProviderStateRegistry.save({
                providerId,
                installationVerified: level1,
                configurationVerified: level2,
                connectivityVerified: level3,
                toolVerificationPassed: level3,
                behaviorVerificationPassed: level4,
                verificationTimestamp: new Date().toISOString()
            }, workspaceRoot);

            ProviderEventLogger.logEvent(providerId, "verified", { state }, workspaceRoot);

            // Write lock file checksum on success
            if (fs.existsSync(activeConfigPath)) {
                const currentLock = ProviderLockRegistry.get(providerId, workspaceRoot);
                if (currentLock) {
                    currentLock.configurationChecksum = checksum;
                    ProviderLockRegistry.save(currentLock, workspaceRoot);
                }
            }

            // Cache validation result
            ProviderVerificationCache.save(providerId, {
                providerVersion: cacheKey.providerVersion,
                brainVersion: cacheKey.brainVersion,
                configurationChecksum: cacheKey.configurationChecksum,
                schemaVersion: cacheKey.schemaVersion,
                verificationResult: finalResult
            }, workspaceRoot);
        } else {
            ProviderHealthRegistry.recordFailure(providerId, workspaceRoot);
            ProviderEventLogger.logEvent(providerId, "audit failed", { errors }, workspaceRoot);
        }

        return finalResult;
    }
}
