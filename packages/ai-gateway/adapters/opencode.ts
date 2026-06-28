// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — OpenCode Adapter
// Transparent wrapper for the OpenCode CLI.
// Self-registers with AdapterRegistry on module load.
// ──────────────────────────────────────────────────────────────────────────────

import type { ProviderAdapterMetadata, LaunchOptions } from "../types.js";
import { AdapterRegistry } from "../adapter-registry.js";
import { BaseProviderAdapter } from "./base.js";
import { ProviderSchemaRegistry, type ProviderSchema } from "../../provider-bridge/schema-registry.js";
import type { ProviderManifest } from "../../provider-bridge/provider-manifest.js";
import path from "path";
import os from "os";

class OpenCodeAdapter extends BaseProviderAdapter implements ProviderSchema {
    readonly id          = "opencode";
    readonly displayName = "OpenCode";
    readonly version     = "1.0.0";

    readonly binaryName = "opencode";

    readonly providerId = "opencode";

    readonly manifest: ProviderManifest = {
        providerId: "opencode",
        displayName: "OpenCode",
        executableNames: ["opencode"],
        supportedPlatforms: ["darwin", "linux", "win32"],
        configurationLocations: [
            { type: "global", pathPattern: "~/.config/opencode/opencode.json" },
            { type: "workspace", pathPattern: "${workspaceRoot}/.opencode/opencode.json" }
        ],
        supportedMcpTransports: ["stdio", "http"],
        configurationSchema: "opencode",
        compatibility: {
            providerId: "opencode",
            minimumVersion: "1.0.0",
            maximumTestedVersion: "2.5.0",
            supportedProtocolVersions: ["mcp-2024-11-05"],
            supportedSchemaVersions: ["opencode-v1"]
        },
        capabilities: {
            supportsGlobalConfiguration: true,
            supportsWorkspaceConfiguration: true,
            supportsMixedConfiguration: true,
            supportsStdioMcp: true,
            supportsHttpMcp: true,
            supportsRuntimeToolDiscovery: true,
            supportsRuntimeToolInvocation: true,
            supportsBehaviorVerification: true,
            supportsTelemetryVerification: true
        },
        supportedIntegrationModes: ["mcp"],
        preferredIntegrationMode: "mcp"
    };

    validate(content: string, isGlobal: boolean): string | null {
        try {
            const parsed = JSON.parse(content);
            if (typeof parsed !== "object" || parsed === null) {
                return "Configuration must be a JSON object";
            }
            const KNOWN_ROOT_KEYS = new Set([
                "$schema", "shell", "logLevel", "server", "command", "skills",
                "references", "reference", "watcher", "snapshot", "plugin", "share",
                "autoshare", "autoupdate", "disabled_providers", "enabled_providers",
                "model", "small_model", "default_agent", "username", "mode", "agent",
                "provider", "mcp", "theme", "keybinds", "layout", "attachment",
                "experimental",
            ]);
            const unknown = Object.keys(parsed).filter(k => !KNOWN_ROOT_KEYS.has(k));
            if (unknown.length > 0) {
                return `Configuration contains keys not recognised by the OpenCode schema: ${unknown.join(", ")}`;
            }
            return null;
        } catch (err: any) {
            return `Invalid JSON: ${err.message}`;
        }
    }

    buildMcpConfiguration(opts: { transport: "stdio" | "http"; port?: number }): Record<string, any> {
        if (opts.transport === "stdio") {
            return {
                type:    "local",
                command: ["brain", "mcp", "stdio"],
                enabled: true,
            };
        }
        const port = opts.port ?? 8765;
        return {
            type:    "remote",
            url:     `http://127.0.0.1:${port}`,
            enabled: true,
        };
    }

    migrateConfiguration(oldConfiguration: string, installedVersion: string): { success: boolean; newConfiguration: string; error?: string } {
        try {
            if (!oldConfiguration.trim()) {
                return { success: true, newConfiguration: "{}" };
            }
            const parsed = JSON.parse(oldConfiguration);
            if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
                const legacy = parsed.mcpServers;
                if (legacy.brain) {
                    const mcpRoot = parsed.mcp || {};
                    parsed.mcp = {
                        ...mcpRoot,
                        brain: {
                            type: "local",
                            command: ["brain", "mcp", "stdio"],
                            enabled: true
                        }
                    };
                    delete legacy.brain;
                }
                if (Object.keys(legacy).length === 0) {
                    delete parsed.mcpServers;
                }
            }
            return { success: true, newConfiguration: JSON.stringify(parsed, null, 2) };
        } catch (err: any) {
            return { success: false, error: err.message, newConfiguration: oldConfiguration };
        }
    }

    protected buildArgs(opts: LaunchOptions): string[] {
        return opts.extraArgs;
    }

    metadata(): ProviderAdapterMetadata {
        return {
            id:               this.id,
            displayName:      this.displayName,
            version:          this.version,
            capabilities:     ["analyze", "create", "modify", "refactor", "validate"],
            supportsStreaming: true,
        };
    }
}

const adapter = new OpenCodeAdapter();
AdapterRegistry.register(adapter);
ProviderSchemaRegistry.register(adapter);

export { OpenCodeAdapter };
