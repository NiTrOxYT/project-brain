// ──────────────────────────────────────────────────────────────────────────────
// BUILD-068 — AI Gateway — Continue Adapter
// Transparent wrapper for the Continue.dev CLI/configurations.
// Self-registers with both registries on module load.
// ──────────────────────────────────────────────────────────────────────────────
import { AdapterRegistry } from "../adapter-registry.js";
import { BaseProviderAdapter } from "./base.js";
import { ProviderSchemaRegistry } from "../../provider-bridge/schema-registry.js";
class ContinueAdapter extends BaseProviderAdapter {
    id = "continue";
    displayName = "Continue.dev";
    version = "1.0.0";
    binaryName = "continue";
    providerId = "continue";
    manifest = {
        providerId: "continue",
        displayName: "Continue.dev",
        executableNames: ["continue"],
        supportedPlatforms: ["darwin", "linux", "win32"],
        configurationLocations: [
            { type: "global", pathPattern: "~/.continue/config.yaml" },
            { type: "global", pathPattern: "~/.continue/config.json" },
            { type: "workspace", pathPattern: "${workspaceRoot}/.continue/config.yaml" },
            { type: "workspace", pathPattern: "${workspaceRoot}/.continue/config.json" }
        ],
        supportedMcpTransports: ["stdio", "http"],
        configurationSchema: "continue",
        compatibility: {
            providerId: "continue",
            minimumVersion: "0.8.0",
            maximumTestedVersion: "0.95.0",
            supportedProtocolVersions: ["mcp-2024-11-05"],
            supportedSchemaVersions: ["continue-yaml-v1"]
        },
        capabilities: {
            supportsGlobalConfiguration: true,
            supportsWorkspaceConfiguration: true,
            supportsMixedConfiguration: true,
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
        if (content.trim().startsWith("{")) {
            try {
                JSON.parse(content);
                return null;
            }
            catch (err) {
                return `Invalid JSON config: ${err.message}`;
            }
        }
        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (trimmed === "")
                continue;
            if (trimmed.includes(":") && !trimmed.startsWith("#")) {
                const parts = trimmed.split(":");
                if (parts[0].trim() === "") {
                    return `Missing key name at line ${i + 1}`;
                }
            }
        }
        return null;
    }
    buildMcpConfiguration(opts) {
        if (opts.transport === "stdio") {
            return {
                name: "brain",
                type: "stdio",
                command: "brain",
                args: ["mcp", "stdio"]
            };
        }
        const port = opts.port ?? 8765;
        return {
            name: "brain",
            type: "sse",
            url: `http://127.0.0.1:${port}`
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
            capabilities: ["analyze", "create", "modify", "refactor", "validate"],
            supportsStreaming: true,
        };
    }
}
const adapter = new ContinueAdapter();
AdapterRegistry.register(adapter);
ProviderSchemaRegistry.register(adapter);
export { ContinueAdapter };
