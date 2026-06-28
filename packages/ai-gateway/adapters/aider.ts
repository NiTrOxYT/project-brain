// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Aider Adapter
// Transparent wrapper for the Aider CLI.
// Self-registers with AdapterRegistry on module load.
// ──────────────────────────────────────────────────────────────────────────────

import type { ProviderAdapterMetadata, LaunchOptions } from "../types.js";
import { AdapterRegistry } from "../adapter-registry.js";
import { BaseProviderAdapter } from "./base.js";
import { ProviderSchemaRegistry, type ProviderSchema } from "../../provider-bridge/schema-registry.js";
import type { ProviderManifest } from "../../provider-bridge/provider-manifest.js";
import path from "path";
import os from "os";

class AiderAdapter extends BaseProviderAdapter implements ProviderSchema {
    readonly id          = "aider";
    readonly displayName = "Aider";
    readonly version     = "1.0.0";

    readonly binaryName = "aider";

    readonly providerId = "aider";

    readonly manifest: ProviderManifest = {
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

    validate(content: string, isGlobal: boolean): string | null {
        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (trimmed === "") continue;
            if (trimmed.includes(":") && !trimmed.startsWith("#")) {
                const parts = trimmed.split(":");
                if (parts[0].trim() === "") {
                    return `Missing key name at line ${i + 1}`;
                }
            }
        }
        return null;
    }

    buildMcpConfiguration(opts: { transport: "stdio" | "http"; port?: number }): string {
        return ".brain/instructions.txt";
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
            capabilities:     ["analyze", "create", "modify", "refactor", "validate", "cleanup"],
            supportsStreaming: true,
        };
    }
}

const adapter = new AiderAdapter();
AdapterRegistry.register(adapter);
ProviderSchemaRegistry.register(adapter);

export { AiderAdapter };
