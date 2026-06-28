// ──────────────────────────────────────────────────────────────────────────────
// BUILD-068 — AI Gateway — Claude Code Adapter
// Transparent wrapper for the Claude Code CLI (@anthropic-ai/claude-code).
// Self-registers with both registries on module load.
// ──────────────────────────────────────────────────────────────────────────────

import type { ProviderAdapterMetadata, LaunchOptions } from "../types.js";
import { AdapterRegistry } from "../adapter-registry.js";
import { BaseProviderAdapter } from "./base.js";
import { ProviderSchemaRegistry, type ProviderSchema } from "../../provider-bridge/schema-registry.js";
import type { ProviderManifest } from "../../provider-bridge/provider-manifest.js";
import path from "path";
import os from "os";

class ClaudeCodeAdapter extends BaseProviderAdapter implements ProviderSchema {
    readonly id          = "claude-code";
    readonly displayName = "Claude Code";
    readonly version     = "1.0.0";

    readonly binaryName = "claude";

    readonly providerId = "claude-code";

    readonly manifest: ProviderManifest = {
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
        return {
            command: "brain",
            args: ["mcp", "stdio"]
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

const adapter = new ClaudeCodeAdapter();
AdapterRegistry.register(adapter);
ProviderSchemaRegistry.register(adapter);

export { ClaudeCodeAdapter };
