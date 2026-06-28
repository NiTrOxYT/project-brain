// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Aider Adapter
// Transparent wrapper for the Aider CLI.
// Self-registers with AdapterRegistry on module load.
// ──────────────────────────────────────────────────────────────────────────────
import { AdapterRegistry } from "../adapter-registry.js";
import { BaseProviderAdapter } from "./base.js";
import { ProviderSchemaRegistry } from "../../provider-bridge/schema-registry.js";
class AiderAdapter extends BaseProviderAdapter {
    id = "aider";
    displayName = "Aider";
    version = "1.0.0";
    binaryName = "aider";
    providerId = "aider";
    manifest = {
        providerId: "aider",
        displayName: "Aider",
        executableNames: ["aider"],
        supportedPlatforms: ["darwin", "linux", "win32"],
        configurationLocations: [
            { type: "global", pathPattern: "~/.aider.conf.yml" },
            { type: "workspace", pathPattern: "${workspaceRoot}/.aider.conf.yml" }
        ],
        supportedMcpTransports: [],
        configurationSchema: "aider",
        compatibility: {
            providerId: "aider",
            minimumVersion: "0.30.0",
            maximumTestedVersion: "0.45.0",
            supportedProtocolVersions: [],
            supportedSchemaVersions: ["aider-read-v1"]
        },
        capabilities: {
            supportsGlobalConfiguration: true,
            supportsWorkspaceConfiguration: true,
            supportsMixedConfiguration: true,
            supportsStdioMcp: false,
            supportsHttpMcp: false,
            supportsRuntimeToolDiscovery: false,
            supportsRuntimeToolInvocation: false,
            supportsBehaviorVerification: false,
            supportsTelemetryVerification: false
        },
        supportedIntegrationModes: ["api"],
        preferredIntegrationMode: "api"
    };
    validate(content, isGlobal) {
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
        return ".brain/instructions.txt";
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
            capabilities: ["analyze", "create", "modify", "refactor", "validate", "cleanup"],
            supportsStreaming: true,
        };
    }
}
const adapter = new AiderAdapter();
AdapterRegistry.register(adapter);
ProviderSchemaRegistry.register(adapter);
export { AiderAdapter };
