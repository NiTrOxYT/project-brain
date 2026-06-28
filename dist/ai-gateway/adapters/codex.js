// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Codex Adapter
// Transparent wrapper for the OpenAI Codex CLI.
// Self-registers with AdapterRegistry on module load.
// ──────────────────────────────────────────────────────────────────────────────
import { AdapterRegistry } from "../adapter-registry.js";
import { BaseProviderAdapter } from "./base.js";
import { ProviderSchemaRegistry } from "../../provider-bridge/schema-registry.js";
class CodexAdapter extends BaseProviderAdapter {
    id = "codex";
    displayName = "Codex (OpenAI)";
    version = "1.0.0";
    binaryName = "codex";
    providerId = "codex";
    manifest = {
        providerId: "codex",
        displayName: "Codex (OpenAI)",
        executableNames: ["codex"],
        supportedPlatforms: ["darwin", "linux", "win32"],
        configurationLocations: [
            { type: "global", pathPattern: "~/.codex/config.toml" },
            { type: "workspace", pathPattern: "${workspaceRoot}/.codex/config.toml" }
        ],
        supportedMcpTransports: ["stdio"],
        configurationSchema: "codex",
        compatibility: {
            providerId: "codex",
            minimumVersion: "0.1.0",
            maximumTestedVersion: "1.8.0",
            supportedProtocolVersions: ["mcp-2024-11-05"],
            supportedSchemaVersions: ["codex-toml-v1"]
        },
        capabilities: {
            supportsGlobalConfiguration: true,
            supportsWorkspaceConfiguration: true,
            supportsMixedConfiguration: true,
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
        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith("[") && !line.endsWith("]")) {
                return `Invalid TOML header at line ${i + 1}: ${line}`;
            }
            if (line.includes("=") && !line.startsWith("#")) {
                const parts = line.split("=");
                if (parts[0].trim() === "") {
                    return `Missing key name at line ${i + 1}`;
                }
            }
        }
        return null;
    }
    buildMcpConfiguration(opts) {
        return {
            command: "brain",
            args: ["mcp", "stdio"],
            enabled: true
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
const adapter = new CodexAdapter();
AdapterRegistry.register(adapter);
ProviderSchemaRegistry.register(adapter);
export { CodexAdapter };
