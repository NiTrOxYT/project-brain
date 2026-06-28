// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Claude Adapter
// Transparent wrapper for the Anthropic Claude CLI.
// Self-registers with AdapterRegistry on module load.
// ──────────────────────────────────────────────────────────────────────────────

import type { ProviderAdapterMetadata, LaunchOptions } from "../types.js";
import { AdapterRegistry } from "../adapter-registry.js";
import { BaseProviderAdapter } from "./base.js";
import { ProviderSchemaRegistry, type ProviderSchema } from "../../provider-bridge/schema-registry.js";
import type { ProviderManifest } from "../../provider-bridge/provider-manifest.js";
import path from "path";
import os from "os";

class ClaudeAdapter extends BaseProviderAdapter implements ProviderSchema {
    readonly id          = "claude";
    readonly displayName = "Claude (Anthropic)";
    readonly version     = "1.0.0";

    readonly binaryName = "claude";

    readonly providerId = "claude";

    readonly manifest: ProviderManifest = {
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

    validate(content: string, isGlobal: boolean): string | null {
        try {
            const parsed = JSON.parse(content);
            if (typeof parsed !== "object" || parsed === null) {
                return "Configuration must be a JSON object";
            }
            return null;
        } catch (err: any) {
            return `Invalid JSON: ${err.message}`;
        }
    }

    buildMcpConfiguration(opts: { transport: "stdio" | "http"; port?: number }): Record<string, any> {
        if (opts.transport === "stdio") {
            return { command: "brain", args: ["mcp", "stdio"] };
        }
        const port = opts.port ?? 8765;
        return { url: `http://127.0.0.1:${port}` };
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
            capabilities:     ["analyze", "create", "modify", "refactor", "document", "test", "validate"],
            supportsStreaming: true,
        };
    }
}

const adapter = new ClaudeAdapter();
AdapterRegistry.register(adapter);
ProviderSchemaRegistry.register(adapter);

export { ClaudeAdapter };
