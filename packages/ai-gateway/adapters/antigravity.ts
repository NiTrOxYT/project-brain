// ──────────────────────────────────────────────────────────────────────────────
// Antigravity IDE MCP Interceptor Adapter
// ──────────────────────────────────────────────────────────────────────────────

import type { ProviderAdapterMetadata, LaunchOptions } from "../types.js";
import { AdapterRegistry } from "../adapter-registry.js";
import { BaseProviderAdapter } from "./base.js";
import { ProviderSchemaRegistry, type ProviderSchema } from "../../provider-bridge/schema-registry.js";
import type { ProviderManifest } from "../../provider-bridge/provider-manifest.js";
import path from "path";
import os from "os";
import fs from "fs";

class AntigravityAdapter extends BaseProviderAdapter implements ProviderSchema {
    readonly id          = "antigravity";
    readonly displayName = "Antigravity IDE";
    readonly version     = "1.0.0";

    readonly binaryName = "antigravity";

    readonly providerId = "antigravity";

    readonly manifest: ProviderManifest = {
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

    validate(content: string, isGlobal: boolean): string | null {
        try {
            if (!content.trim()) return null;
            const parsed = JSON.parse(content);
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
                return "Configuration must be a JSON object";
            }
            if (parsed.mcpServers !== undefined && (typeof parsed.mcpServers !== "object" || parsed.mcpServers === null || Array.isArray(parsed.mcpServers))) {
                return "mcpServers must be an object";
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

    override providerCapabilities(): any {
        return {
            launchWrapper:   false, // Antigravity does not use CLI wrappers
            promptBridge:    false,
            responseBridge:  false,
            toolBridge:      false,
            workspaceBridge: false,
            mcpBridge:       true,
            apiBridge:       false,
            contextProvider: true,
            supportsMcp:     true,
            supportsToolCalling: true,
            supportsPlugins: false,
            supportsSdk:     false
        };
    }

    override async detect(): Promise<boolean> {
        const home = os.homedir();
        const configDir = path.join(home, ".gemini", "config");
        const ideDir = path.join(home, ".gemini", "antigravity-ide");
        const mcpConfig = path.join(configDir, "mcp_config.json");
        return fs.existsSync(configDir) || fs.existsSync(mcpConfig) || fs.existsSync(ideDir);
    }

    override async resolvedBinaryPath(): Promise<string> {
        const home = os.homedir();
        const configDir = path.join(home, ".gemini", "config");
        const ideDir = path.join(home, ".gemini", "antigravity-ide");
        const mcpConfig = path.join(configDir, "mcp_config.json");
        if (fs.existsSync(configDir) || fs.existsSync(mcpConfig) || fs.existsSync(ideDir)) {
            return configDir;
        }
        throw new Error("Antigravity configuration directories not found.");
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

const adapter = new AntigravityAdapter();
AdapterRegistry.register(adapter);
ProviderSchemaRegistry.register(adapter);

export { AntigravityAdapter };
