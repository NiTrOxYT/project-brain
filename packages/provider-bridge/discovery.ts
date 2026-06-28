// ──────────────────────────────────────────────────────────────────────────────
// BUILD-069 — Provider Configuration Discovery Engine (Synchronous & Always Returns Config)
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { ProviderSchemaRegistry } from "./schema-registry.js";
import type { ProviderCapabilities, ProviderVersionSupport } from "./provider-capabilities.js";
import type { ProviderCapabilities as LegacyProviderCapabilities } from "./types.js";
import { resolvePathPattern } from "./provider-manifest.js";
import { compareVersions, ProviderCompatibilityRegistry } from "./provider-compatibility.js";
import type { ProviderIntegrationMode } from "./provider-integration.js";

export interface ProviderConfiguration {
    providerId:          string;
    version:             string;
    executable:          string;
    globalConfigs:       string[];
    workspaceConfigs:    string[];
    activeConfiguration: "global" | "workspace" | "mixed";
    supportedTransports: ("stdio" | "http")[];
    versionSupport?:     ProviderVersionSupport;
    configCapabilities:  ProviderCapabilities;
    capabilities:        LegacyProviderCapabilities; // for backward compatibility
    installed:           boolean;
    supportedIntegrationModes: ProviderIntegrationMode[];
    preferredIntegrationMode: ProviderIntegrationMode;
    selectedIntegrationMode:  ProviderIntegrationMode;
}

function resolveBinarySync(executableNames: string[]): string {
    const pathEnv = process.env.PATH ?? process.env.Path ?? "";
    const delimiter = process.platform === "win32" ? ";" : ":";
    const entries = pathEnv.split(delimiter);
    const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
    
    for (const binaryName of executableNames) {
        for (const entry of entries) {
            if (!entry) continue;
            for (const ext of extensions) {
                const fullPath = path.join(entry.trim(), `${binaryName}${ext}`);
                if (fs.existsSync(fullPath)) {
                    try {
                        if (!fs.statSync(fullPath).isDirectory()) {
                            fs.accessSync(fullPath, fs.constants.X_OK);
                            return fullPath;
                        }
                    } catch {}
                }
            }
        }
    }
    return "";
}

export class ProviderDiscoveryEngine {
    static getBinaryVersion(binaryPath: string, providerId: string): string {
        const args = ["--version"];
        try {
            const stdout = execFileSync(binaryPath, args, { encoding: "utf8", timeout: 1000 }).trim();
            const match = stdout.match(/([0-9]+\.[0-9]+\.[0-9]+)/);
            return match ? match[1] : stdout.split("\n")[0].trim();
        } catch {
            try {
                const stdout = execFileSync(binaryPath, ["-v"], { encoding: "utf8", timeout: 1000 }).trim();
                const match = stdout.match(/([0-9]+\.[0-9]+\.[0-9]+)/);
                return match ? match[1] : stdout.split("\n")[0].trim();
            } catch {
                return "1.0.0";
            }
        }
    }

    static discover(providerId: string, workspaceRoot?: string): ProviderConfiguration {
        const schema = ProviderSchemaRegistry.get(providerId);
        if (!schema) {
            throw new Error(`Provider "${providerId}" has no registered schema.`);
        }

        const manifest = schema.manifest;
        const resolvedBinary = resolveBinarySync(manifest.executableNames);
        let installed = false;
        let executablePath = "";
        let version = "0.0.0";

        if (resolvedBinary) {
            installed = true;
            executablePath = resolvedBinary;
            version = this.getBinaryVersion(executablePath, providerId);
        } else {
            // Check config locations
            const globalPaths = manifest.configurationLocations
                .filter(l => l.type === "global")
                .map(l => resolvePathPattern(l.pathPattern, workspaceRoot));
            const workspacePaths = manifest.configurationLocations
                .filter(l => l.type === "workspace")
                .map(l => resolvePathPattern(l.pathPattern, workspaceRoot));
            const pathCheck = [...globalPaths, ...workspacePaths].some(p => fs.existsSync(p));
            if (pathCheck) {
                installed = true;
                version = "1.0.0";
            }
        }

        const globalConfigs = manifest.configurationLocations
            .filter(l => l.type === "global")
            .map(l => resolvePathPattern(l.pathPattern, workspaceRoot));
        const workspaceConfigs = manifest.configurationLocations
            .filter(l => l.type === "workspace")
            .map(l => resolvePathPattern(l.pathPattern, workspaceRoot));
        
        const globalExists = globalConfigs.some(p => fs.existsSync(p));
        const workspaceExists = workspaceConfigs.some(p => fs.existsSync(p));
        
        let activeConfiguration: "global" | "workspace" | "mixed" = "global";
        if (globalExists && workspaceExists) {
            activeConfiguration = "mixed";
        } else if (workspaceExists) {
            activeConfiguration = "workspace";
        }

        // Automatic Strategy Resolution:
        // Order: Preferred integration -> supported integrations -> mcp fallback -> none
        let selectedIntegrationMode: ProviderIntegrationMode = "none";
        const availableModes = manifest.supportedIntegrationModes;
        if (availableModes.includes(manifest.preferredIntegrationMode)) {
            selectedIntegrationMode = manifest.preferredIntegrationMode;
        } else if (availableModes.length > 0) {
            selectedIntegrationMode = availableModes[0];
        }

        const supportedTransports = manifest.supportedMcpTransports;

        // Compatibility checks
        const compatRes = ProviderCompatibilityRegistry.validateCompatibility(manifest.compatibility, version);
        const versionSupport: ProviderVersionSupport = {
            supported: compatRes.supported,
            minimumVersion: manifest.compatibility.minimumVersion,
            maximumVersion: manifest.compatibility.maximumTestedVersion,
            warning: compatRes.warning || compatRes.error
        };

        // Legacy compatibility object mapping
        const legacyCapabilities: LegacyProviderCapabilities = {
            launchWrapper:   true,
            promptBridge:    false,
            responseBridge:  false,
            toolBridge:      false,
            workspaceBridge: false,
            mcpBridge:       manifest.capabilities.supportsStdioMcp || manifest.capabilities.supportsHttpMcp,
            apiBridge:       false,
            contextProvider: manifest.capabilities.supportsRuntimeToolDiscovery,
            supportsMcp:     manifest.capabilities.supportsStdioMcp || manifest.capabilities.supportsHttpMcp,
            supportsToolCalling: manifest.capabilities.supportsRuntimeToolInvocation,
            supportsPlugins: false,
            supportsSdk:     false
        };

        return {
            providerId,
            version,
            executable: executablePath,
            globalConfigs,
            workspaceConfigs,
            activeConfiguration,
            supportedTransports,
            versionSupport,
            configCapabilities: manifest.capabilities,
            capabilities: legacyCapabilities,
            installed,
            supportedIntegrationModes: manifest.supportedIntegrationModes,
            preferredIntegrationMode: manifest.preferredIntegrationMode,
            selectedIntegrationMode
        };
    }
}
