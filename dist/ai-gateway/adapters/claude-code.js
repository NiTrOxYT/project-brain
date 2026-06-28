// ──────────────────────────────────────────────────────────────────────────────
// BUILD-068 — AI Gateway — Claude Code Adapter
// Transparent wrapper for the Claude Code CLI (@anthropic-ai/claude-code).
// Self-registers with both registries on module load.
// ──────────────────────────────────────────────────────────────────────────────
import { AdapterRegistry } from "../adapter-registry.js";
import { BaseProviderAdapter } from "./base.js";
import { ProviderSchemaRegistry } from "../../provider-bridge/schema-registry.js";
class ClaudeCodeAdapter extends BaseProviderAdapter {
    id = "claude-code";
    displayName = "Claude Code";
    version = "1.0.0";
    binaryName = "claude";
    providerId = "claude-code";
    manifest = {
        providerId: "claude-code",
        displayName: "Claude Code",
        executableNames: ["claude"],
        supportedPlatforms: ["darwin", "linux", "win32"],
        configurationLocations: [
            { type: "global", pathPattern: "~/.claude.json" },
            { type: "global", pathPattern: "~/.claude/settings.json" },
            { type: "workspace", pathPattern: "${workspaceRoot}/.claude/mcp.json" },
            { type: "workspace", pathPattern: "${workspaceRoot}/.claude.json" }
        ],
        supportedMcpTransports: ["stdio"],
        configurationSchema: "claude-code",
        compatibility: {
            providerId: "claude-code",
            minimumVersion: "0.1.0",
            maximumTestedVersion: "0.15.0",
            supportedProtocolVersions: ["mcp-2024-11-05"],
            supportedSchemaVersions: ["claude-code-v1"]
        },
        capabilities: {
            supportsGlobalConfiguration: true,
            supportsWorkspaceConfiguration: true,
            supportsMixedConfiguration: true,
            supportsStdioMcp: true,
            supportsHttpMcp: false,
            supportsRuntimeToolDiscovery: true,
            supportsRuntimeToolInvocation: true,
            supportsBehaviorVerification: true,
            supportsTelemetryVerification: false
        },
        supportedIntegrationModes: ["mcp"],
        preferredIntegrationMode: "mcp"
    };
    validate(content, isGlobal) {
        try {
            const parsed = JSON.parse(content);
            if (typeof parsed !== "object" || parsed === null) {
                return "Configuration must be a JSON object";
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
    buildArgs(opts) {
        return opts.extraArgs;
    }
    metadata() {
        return {
            id: this.id,
            displayName: this.displayName,
            version: this.version,
            capabilities: ["analyze", "create", "modify", "refactor", "validate", "test"],
            supportsStreaming: true,
        };
    }
}
const adapter = new ClaudeCodeAdapter();
AdapterRegistry.register(adapter);
ProviderSchemaRegistry.register(adapter);
export { ClaudeCodeAdapter };
