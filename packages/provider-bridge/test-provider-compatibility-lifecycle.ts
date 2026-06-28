// ──────────────────────────────────────────────────────────────────────────────
// BUILD-069 — Universal Provider Lifecycle and Compatibility Unit/Integration Tests
// ──────────────────────────────────────────────────────────────────────────────

import assert from "assert";
import "../ai-gateway/adapters/index.js";
import fs from "fs";
import path from "path";
import os from "os";
import { compareVersions, ProviderCompatibilityRegistry } from "./provider-compatibility.js";
import { validateManifest } from "./provider-manifest.js";
import type { ProviderManifest } from "./provider-manifest.js";
import { ProviderStrategyRegistry } from "./provider-strategy-registry.js";
import { ProviderSchemaRegistry, type ProviderSchema } from "./schema-registry.js";
import { ProviderLockRegistry } from "./provider-lock.js";
import { ProviderStateRegistry } from "./provider-state.js";
import { ProviderHealthRegistry } from "./provider-health.js";
import { ProviderEventLogger } from "./provider-events.js";
import { ProviderVerificationCache } from "./provider-cache.js";
import { ProviderProfileRegistry } from "./provider-profile.js";
import { ProviderConfigurator } from "./provider-configurator.js";
import { ProviderVerificationEngine } from "./provider-verifier.js";
import { McpToolRegistry } from "../mcp-server/registry.js";

// Initialize a clean test context
const workspaceRoot = path.join(process.cwd(), ".test-workspace-lifecycle");
if (fs.existsSync(workspaceRoot)) {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
}
fs.mkdirSync(workspaceRoot, { recursive: true });

async function runTests() {
    console.log("🚀 Running BUILD-069 Universal Compatibility and Lifecycle Tests...\n");

    // ── 1. Version Comparison Logic ───────────────────────────────────────────
    console.log("  1. Testing compareVersions...");
    assert.strictEqual(compareVersions("1.2.3", "1.2.3"), 0);
    assert.strictEqual(compareVersions("1.2.4", "1.2.3"), 1);
    assert.strictEqual(compareVersions("1.2.2", "1.2.3"), -1);
    assert.strictEqual(compareVersions("10.0.0", "2.0.0"), 1);
    assert.strictEqual(compareVersions("v2.5.1", "2.5.0"), 1);
    assert.strictEqual(compareVersions("0.8", "0.8.0"), 0);
    console.log("    ✓ Version comparison passed.\n");

    // ── 2. Manifest Validation & Schema registry ──────────────────────────────
    console.log("  2. Testing Manifest & Registry...");
    const validManifest: ProviderManifest = {
        providerId: "test-gateway",
        displayName: "Test Gateway",
        executableNames: ["test-gateway-bin"],
        supportedPlatforms: ["darwin", "linux", "win32"],
        configurationLocations: [
            { type: "global", pathPattern: "~/.test-gateway/config.json" }
        ],
        supportedMcpTransports: ["stdio"],
        configurationSchema: "claude",
        compatibility: {
            providerId: "test-gateway",
            minimumVersion: "1.0.0",
            maximumTestedVersion: "2.0.0",
            supportedProtocolVersions: ["mcp-2024-11-05"],
            supportedSchemaVersions: ["v1"]
        },
        capabilities: {
            supportsGlobalConfiguration: true,
            supportsWorkspaceConfiguration: false,
            supportsMixedConfiguration: false,
            supportsStdioMcp: true,
            supportsHttpMcp: false,
            supportsRuntimeToolDiscovery: true,
            supportsRuntimeToolInvocation: true,
            supportsBehaviorVerification: false,
            supportsTelemetryVerification: false
        },
        supportedIntegrationModes: ["mcp"],
        preferredIntegrationMode: "mcp"
    };

    const err = validateManifest(validManifest);
    assert.strictEqual(err, null, `Expected valid manifest, got: ${err}`);

    const invalidManifest: any = {
        providerId: "bad-manifest",
        displayName: "Bad",
        executableNames: [], // Empty executables
        supportedPlatforms: ["freebsd"], // Unsupported platform
        configurationLocations: [],
        supportedMcpTransports: []
    };
    const err2 = validateManifest(invalidManifest);
    assert.ok(err2 !== null, "Expected validation failure for invalid manifest.");
    console.log("    ✓ Manifest validation passed.\n");

    // ── 3. Compatibility Rules & Recommendations ─────────────────────────────
    console.log("  3. Testing Compatibility Registry...");
    const rules = validManifest.compatibility;
    
    // Lower version check
    const lowCheck = ProviderCompatibilityRegistry.validateCompatibility(rules, "0.9.0");
    assert.strictEqual(lowCheck.supported, false);
    assert.ok(lowCheck.error?.includes("below the minimum supported version"));

    // Upgrade actions recommendation
    const recommendation = ProviderCompatibilityRegistry.getRecommendation(rules, "0.9.0");
    assert.ok(recommendation.includes("Upgrade"));

    // Higher tested version check
    const highCheck = ProviderCompatibilityRegistry.validateCompatibility(rules, "2.1.0");
    assert.strictEqual(highCheck.supported, true);
    assert.ok(highCheck.warning?.includes("newer than the latest tested version"));
    console.log("    ✓ Compatibility rules passed.\n");

    // ── 4. Pluggable Strategy Registration & Execution ──────────────────────
    console.log("  4. Testing Strategy Registry...");
    let callTrace: string[] = [];
    const testStrategy = {
        mode: "plugin" as any,
        install: async (context: any) => {
            callTrace.push("install");
            return { success: true };
        },
        uninstall: async (context: any) => {
            callTrace.push("uninstall");
            return { success: true };
        },
        verify: async (context: any) => {
            callTrace.push("verify");
            return { success: true, errors: [] };
        },
        repair: async (context: any) => {
            callTrace.push("repair");
            return { success: true };
        }
    };

    ProviderStrategyRegistry.register(testStrategy);
    const resolved = ProviderStrategyRegistry.resolve("plugin");
    assert.strictEqual(resolved, testStrategy);

    // Duplicate registration protect
    assert.throws(() => {
        ProviderStrategyRegistry.register(testStrategy);
    }, /Duplicate strategy/);
    console.log("    ✓ Pluggable strategies passed.\n");

    // ── 5. OpenCode Config Migrations ──────────────────────────────────────────
    console.log("  5. Testing OpenCode Schema Config Migration...");
    const opencodeSchema = ProviderSchemaRegistry.get("opencode");
    assert.ok(opencodeSchema);

    const legacyConfig = JSON.stringify({
        mcpServers: {
            brain: {
                command: "brain",
                args: ["mcp", "stdio"]
            }
        }
    }, null, 2);

    const migrationRes = opencodeSchema.migrateConfiguration(legacyConfig, "1.5.0");
    assert.strictEqual(migrationRes.success, true);
    const parsed = JSON.parse(migrationRes.newConfiguration);
    assert.ok(parsed.mcp);
    assert.ok(parsed.mcp.brain);
    assert.strictEqual(parsed.mcp.brain.type, "local");
    assert.strictEqual(parsed.mcpServers, undefined);
    console.log("    ✓ Configuration migration passed.\n");

    // ── 6. Persistent States, Health and Events ──────────────────────────────
    console.log("  6. Testing persistence (States, Health, Events)...");
    
    // State model
    ProviderStateRegistry.save({
        providerId: "test-gateway",
        installationVerified: true,
        configurationVerified: true,
        connectivityVerified: false,
        toolVerificationPassed: false,
        behaviorVerificationPassed: false,
        verificationTimestamp: new Date().toISOString()
    }, workspaceRoot);
    const loadedState = ProviderStateRegistry.get("test-gateway", workspaceRoot);
    assert.ok(loadedState);
    assert.strictEqual(loadedState.configurationVerified, true);

    // Health logs
    ProviderHealthRegistry.recordSuccess("test-gateway", "lastSuccessfulVerification", workspaceRoot);
    const health = ProviderHealthRegistry.get("test-gateway", workspaceRoot);
    assert.ok(health.lastSuccessfulVerification);
    assert.strictEqual(health.consecutiveFailures, 0);

    ProviderHealthRegistry.recordFailure("test-gateway", workspaceRoot);
    const failedHealth = ProviderHealthRegistry.get("test-gateway", workspaceRoot);
    assert.strictEqual(failedHealth.consecutiveFailures, 1);

    // Events logs (JSONL)
    ProviderEventLogger.logEvent("test-gateway", "configured", { detail: "test" }, workspaceRoot);
    const events = ProviderEventLogger.queryEvents("test-gateway", workspaceRoot);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].event, "configured");
    console.log("    ✓ Persistence database tests passed.\n");

    // ── 7. Drift Detection & Revalidation Cache ───────────────────────────────
    console.log("  7. Testing Configuration Locks and Drift Detection...");
    const testConfigPath = path.join(workspaceRoot, "config.json");
    fs.writeFileSync(testConfigPath, JSON.stringify({ key: "val" }), "utf-8");

    const sum1 = ProviderLockRegistry.calculateChecksum(testConfigPath);
    ProviderLockRegistry.save({
        providerId: "test-gateway",
        executablePath: "/usr/bin/test-gateway",
        detectedVersion: "1.5.0",
        selectedTransport: "stdio",
        configurationFile: testConfigPath,
        schemaVersion: "v1",
        configurationChecksum: sum1,
        selectedIntegrationMode: "mcp"
    }, workspaceRoot);

    // Initial check drift -> false
    const driftCheck1 = ProviderLockRegistry.checkDrift(
        "test-gateway",
        "/usr/bin/test-gateway",
        "1.5.0",
        testConfigPath,
        workspaceRoot
    );
    assert.strictEqual(driftCheck1.drifted, false);

    // Modify file -> check drift -> true
    fs.writeFileSync(testConfigPath, JSON.stringify({ key: "val-modified" }), "utf-8");
    const driftCheck2 = ProviderLockRegistry.checkDrift(
        "test-gateway",
        "/usr/bin/test-gateway",
        "1.5.0",
        testConfigPath,
        workspaceRoot
    );
    assert.strictEqual(driftCheck2.drifted, true);
    assert.ok(driftCheck2.reason?.includes("checksum changed"));

    // Cache revalidation
    ProviderVerificationCache.save("test-gateway", {
        providerVersion: "1.5.0",
        brainVersion: "0.1.0",
        configurationChecksum: "some-hash",
        schemaVersion: "v1",
        verificationResult: { cached: true }
    }, workspaceRoot);

    const cachedVal = ProviderVerificationCache.get("test-gateway", workspaceRoot);
    assert.ok(cachedVal);
    assert.strictEqual(cachedVal.verificationResult.cached, true);
    console.log("    ✓ Configuration lock and drift checks passed.\n");

    // ── 8. Profile Discovery ─────────────────────────────────────────────────
    console.log("  8. Testing Profile Discovery...");
    // Register test schema
    const testSchema: ProviderSchema = {
        providerId: "test-gateway",
        manifest: validManifest,
        validate: (c) => null,
        buildMcpConfiguration: (o) => ({}),
        migrateConfiguration: (o) => ({ success: true, newConfiguration: o })
    };
    ProviderSchemaRegistry.register(testSchema);

    const profile = ProviderProfileRegistry.generateProfile("test-gateway", workspaceRoot);
    assert.strictEqual(profile.providerId, "test-gateway");
    assert.ok(profile.availableFeatures.includes("stdio-transport"));
    assert.ok(profile.availableFeatures.includes("mcp-tool-discovery"));
    console.log("    ✓ Dynamic profile generation passed.\n");

    console.log("🎉 All compatibility and lifecycle checks passed successfully!\n");
}

runTests().catch((err) => {
    console.error("❌ Test failed:", err);
    process.exit(1);
});
