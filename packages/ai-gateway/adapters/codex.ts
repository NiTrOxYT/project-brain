// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Codex Adapter
// Transparent wrapper for the OpenAI Codex CLI.
// Self-registers with AdapterRegistry on module load.
// ──────────────────────────────────────────────────────────────────────────────

import type { ProviderAdapterMetadata, LaunchOptions } from "../types.js";
import { AdapterRegistry } from "../adapter-registry.js";
import { BaseProviderAdapter } from "./base.js";
import { ProviderSchemaRegistry, type ProviderSchema } from "../../provider-bridge/schema-registry.js";
import type { ProviderManifest } from "../../provider-bridge/provider-manifest.js";
import path from "path";
import os from "os";

class CodexAdapter extends BaseProviderAdapter implements ProviderSchema {
    readonly id          = "codex";
    readonly displayName = "Codex (OpenAI)";
    readonly version     = "1.0.0";

    readonly binaryName = "codex";

    readonly providerId = "codex";

    readonly manifest: ProviderManifest = {
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

    validate(content: string, isGlobal: boolean): string | null {
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

    buildMcpConfiguration(opts: { transport: "stdio" | "http"; port?: number }): Record<string, any> {
        return {
            command: "brain",
            args: ["mcp", "stdio"],
            enabled: true
        };
    }

    migrateConfiguration(oldConfiguration: string, installedVersion: string): { success: boolean; newConfiguration: string; error?: string } {
        return { success: true, newConfiguration: oldConfiguration };
    }

    protected buildArgs(opts: LaunchOptions): string[] {
        return opts.extraArgs;
    }

    metadata(): ProviderAdapterMetadata {
        return {
            id:               this.id,
            displayName:      this.displayName,
            version:          this.version,
            capabilities:     ["analyze", "create", "modify", "refactor", "validate", "test"],
            supportsStreaming: true,
        };
    }
}

const adapter = new CodexAdapter();
AdapterRegistry.register(adapter);
ProviderSchemaRegistry.register(adapter);

export { CodexAdapter };
