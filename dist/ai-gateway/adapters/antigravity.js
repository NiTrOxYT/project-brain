// ──────────────────────────────────────────────────────────────────────────────
// Antigravity IDE MCP Interceptor Adapter
// ──────────────────────────────────────────────────────────────────────────────
import { AdapterRegistry } from "../adapter-registry.js";
import { BaseProviderAdapter } from "./base.js";
import { ProviderSchemaRegistry } from "../../provider-bridge/schema-registry.js";
import path from "path";
import os from "os";
import fs from "fs";
class AntigravityAdapter extends BaseProviderAdapter {
    id = "antigravity";
    displayName = "Antigravity IDE";
    version = "1.0.0";
    binaryName = "antigravity";
    providerId = "antigravity";
    manifest = {
        providerId: "antigravity",
        displayName: "Antigravity IDE",
        executableNames: ["antigravity"],
        supportedPlatforms: ["darwin", "linux", "win32"],
        configurationLocations: [
            { type: "global", pathPattern: "~/.gemini/config/mcp_config.json" }
        ],
        supportedMcpTransports: ["stdio"],
        configurationSchema: "antigravity",
        compatibility: {
            providerId: "antigravity",
            minimumVersion: "1.0.0",
            maximumTestedVersion: "3.0.0",
            supportedProtocolVersions: ["mcp-2024-11-05"],
            supportedSchemaVersions: ["antigravity-v1"]
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
    validate(content, isGlobal) {
        try {
            if (!content.trim())
                return null;
            const parsed = JSON.parse(content);
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
                return "Configuration must be a JSON object";
            }
            if (parsed.mcpServers !== undefined && (typeof parsed.mcpServers !== "object" || parsed.mcpServers === null || Array.isArray(parsed.mcpServers))) {
                return "mcpServers must be an object";
            }
            return null;
        }
        catch (err) {
            return `Invalid JSON: ${err.message}`;
        }
    }
    buildMcpConfiguration(opts) {
        return {
            command: "brain",
            args: ["mcp", "stdio"]
        };
    }
    migrateConfiguration(oldConfiguration, installedVersion) {
        return { success: true, newConfiguration: oldConfiguration };
    }
    providerCapabilities() {
        return {
            launchWrapper: false, // Antigravity does not use CLI wrappers
            promptBridge: false,
            responseBridge: false,
            toolBridge: false,
            workspaceBridge: false,
            mcpBridge: true,
            apiBridge: false,
            contextProvider: true,
            supportsMcp: true,
            supportsToolCalling: true,
            supportsPlugins: false,
            supportsSdk: false
        };
    }
    async detect() {
        const home = os.homedir();
        const configDir = path.join(home, ".gemini", "config");
        const ideDir = path.join(home, ".gemini", "antigravity-ide");
        const mcpConfig = path.join(configDir, "mcp_config.json");
        return fs.existsSync(configDir) || fs.existsSync(mcpConfig) || fs.existsSync(ideDir);
    }
    async resolvedBinaryPath() {
        const home = os.homedir();
        const configDir = path.join(home, ".gemini", "config");
        const ideDir = path.join(home, ".gemini", "antigravity-ide");
        const mcpConfig = path.join(configDir, "mcp_config.json");
        if (fs.existsSync(configDir) || fs.existsSync(mcpConfig) || fs.existsSync(ideDir)) {
            return configDir;
        }
        throw new Error("Antigravity configuration directories not found.");
    }
    buildArgs(opts) {
        return opts.extraArgs;
    }
    metadata() {
        return {
            id: this.id,
            displayName: this.displayName,
            version: this.version,
            capabilities: ["analyze", "create", "modify", "refactor", "validate"],
            supportsStreaming: true,
        };
    }
}
const adapter = new AntigravityAdapter();
AdapterRegistry.register(adapter);
ProviderSchemaRegistry.register(adapter);
export { AntigravityAdapter };
