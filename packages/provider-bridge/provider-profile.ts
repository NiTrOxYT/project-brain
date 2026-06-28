// ──────────────────────────────────────────────────────────────────────────────
// BUILD-069 — Provider Profile Generator
// ──────────────────────────────────────────────────────────────────────────────

import { ProviderSchemaRegistry } from "./schema-registry.js";
import { ProviderDiscoveryEngine } from "./discovery.js";
import type { ProviderIntegrationMode } from "./provider-integration.js";

export interface ProviderProfile {
    providerId:          string;
    version:             string;
    platform:            NodeJS.Platform;
    configurationMode:   "global" | "workspace" | "mixed";
    availableTransports: ("stdio" | "http")[];
    availableFeatures:   string[];
    protocolVersion?:    string;
    schemaVersion?:      string;
}

export class ProviderProfileRegistry {
    static generateProfile(providerId: string, workspaceRoot?: string): ProviderProfile {
        const schema = ProviderSchemaRegistry.get(providerId);
        if (!schema) {
            throw new Error(`Cannot generate profile: Provider "${providerId}" has no registered schema.`);
        }

        const config = ProviderDiscoveryEngine.discover(providerId, workspaceRoot);
        const manifest = schema.manifest;

        // Discover features dynamically
        const availableFeatures: string[] = [];
        if (manifest.capabilities.supportsGlobalConfiguration) availableFeatures.push("global-configuration");
        if (manifest.capabilities.supportsWorkspaceConfiguration) availableFeatures.push("workspace-configuration");
        if (manifest.capabilities.supportsStdioMcp) availableFeatures.push("stdio-transport");
        if (manifest.capabilities.supportsHttpMcp) availableFeatures.push("http-transport");
        if (manifest.capabilities.supportsRuntimeToolDiscovery) availableFeatures.push("mcp-tool-discovery");
        if (manifest.capabilities.supportsRuntimeToolInvocation) availableFeatures.push("runtime-tool-invocation");
        if (manifest.capabilities.supportsBehaviorVerification) availableFeatures.push("behavioral-telemetry");

        // Strategy features
        for (const mode of manifest.supportedIntegrationModes) {
            availableFeatures.push(`strategy-${mode}`);
        }

        return {
            providerId,
            version: config.version,
            platform: process.platform,
            configurationMode: config.activeConfiguration,
            availableTransports: config.supportedTransports,
            availableFeatures,
            protocolVersion: manifest.compatibility.supportedProtocolVersions[0],
            schemaVersion: manifest.compatibility.supportedSchemaVersions[0]
        };
    }
}
