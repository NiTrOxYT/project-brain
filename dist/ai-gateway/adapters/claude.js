// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Claude Adapter
// Transparent wrapper for the Anthropic Claude CLI.
// Self-registers with AdapterRegistry on module load.
// ──────────────────────────────────────────────────────────────────────────────
import { AdapterRegistry } from "../adapter-registry.js";
import { BaseProviderAdapter } from "./base.js";
import { ProviderSchemaRegistry } from "../../provider-bridge/schema-registry.js";
class ClaudeAdapter extends BaseProviderAdapter {
    id = "claude";
    displayName = "Claude (Anthropic)";
    version = "1.0.0";
    binaryName = "claude";
    providerId = "claude";
    manifest = {
        providerId: "claude",
        displayName: "Claude (Anthropic)",
        executableNames: ["claude"],
        supportedPlatforms: ["darwin", "linux", "win32"],
        configurationLocations: [
            { type: "global", pathPattern: "~/Library/Application Support/Claude/claude_desktop_config.json" },
            { type: "global", pathPattern: "~/.config/Claude/claude_desktop_config.json" },
            { type: "global", pathPattern: "~/AppData/Roaming/Claude/claude_desktop_config.json" }
        ],
        supportedMcpTransports: ["stdio", "http"],
        configurationSchema: "claude",
        compatibility: {
            providerId: "claude",
            minimumVersion: "0.1.0",
            maximumTestedVersion: "0.20.0",
            supportedProtocolVersions: ["mcp-2024-11-05"],
            supportedSchemaVersions: ["claude-desktop-v1"]
        },
        capabilities: {
            supportsGlobalConfiguration: true,
            supportsWorkspaceConfiguration: false,
            supportsMixedConfiguration: false,
            supportsStdioMcp: true,
            supportsHttpMcp: true,
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
        if (opts.transport === "stdio") {
            return { command: "brain", args: ["mcp", "stdio"] };
        }
        const port = opts.port ?? 8765;
        return { url: `http://127.0.0.1:${port}` };
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
            capabilities: ["analyze", "create", "modify", "refactor", "document", "test", "validate"],
            supportsStreaming: true,
        };
    }
}
const adapter = new ClaudeAdapter();
AdapterRegistry.register(adapter);
ProviderSchemaRegistry.register(adapter);
export { ClaudeAdapter };
