// ──────────────────────────────────────────────────────────────────────────────
// BUILD-069 — Provider Manifest Definitions
// ──────────────────────────────────────────────────────────────────────────────

import path from "path";
import os from "os";
import fs from "fs";
import type { ProviderCompatibility } from "./provider-compatibility.js";
import type { ProviderCapabilities } from "./provider-capabilities.js";
import type { ProviderIntegrationMode } from "./provider-integration.js";

export type Platform = "darwin" | "linux" | "win32";

export interface ConfigurationLocation {
    type: "global" | "workspace";
    pathPattern: string;
}

export interface ProviderManifest {
    providerId: string;
    displayName: string;
    executableNames: string[];
    supportedPlatforms: Platform[];
    configurationLocations: ConfigurationLocation[];
    supportedMcpTransports: ("stdio" | "http")[];
    configurationSchema: string;
    compatibility: ProviderCompatibility;
    capabilities: ProviderCapabilities;
    supportedIntegrationModes: ProviderIntegrationMode[];
    preferredIntegrationMode: ProviderIntegrationMode;
}

export function resolvePathPattern(pattern: string, workspaceRoot?: string): string {
    let resolved = pattern;
    if (pattern.startsWith("~/") || pattern === "~") {
        resolved = path.join(os.homedir(), pattern.slice(2));
    }
    if (workspaceRoot) {
        resolved = resolved.replace("${workspaceRoot}", workspaceRoot);
        if (!path.isAbsolute(resolved)) {
            resolved = path.resolve(workspaceRoot, resolved);
        }
    } else {
        resolved = resolved.replace("${workspaceRoot}", process.cwd());
    }
    return resolved;
}

export function validateManifest(manifest: ProviderManifest): string | null {
    if (!manifest.providerId || typeof manifest.providerId !== "string" || manifest.providerId.trim() === "") {
        return "Manifest must declare a valid unique providerId.";
    }
    if (!manifest.displayName || typeof manifest.displayName !== "string") {
        return "Manifest must declare a valid displayName.";
    }
    if (!Array.isArray(manifest.executableNames) || manifest.executableNames.length === 0) {
        return "Manifest must declare at least one executable name.";
    }
    if (!Array.isArray(manifest.supportedPlatforms)) {
        return "Manifest must declare supportedPlatforms array.";
    }
    if (!Array.isArray(manifest.configurationLocations)) {
        return "Manifest must declare configurationLocations array.";
    }
    if (!Array.isArray(manifest.supportedMcpTransports)) {
        return "Manifest must declare supportedMcpTransports array.";
    }
    if (!manifest.configurationSchema || typeof manifest.configurationSchema !== "string") {
        return "Manifest must declare a configurationSchema identifier.";
    }
    if (!manifest.compatibility || typeof manifest.compatibility !== "object") {
        return "Manifest must contain a compatibility object.";
    }
    if (!manifest.capabilities || typeof manifest.capabilities !== "object") {
        return "Manifest must contain a capabilities object.";
    }
    if (!Array.isArray(manifest.supportedIntegrationModes) || manifest.supportedIntegrationModes.length === 0) {
        return "Manifest must declare supportedIntegrationModes array.";
    }
    if (!manifest.preferredIntegrationMode) {
        return "Manifest must declare a preferredIntegrationMode.";
    }
    return null;
}

export function getActiveConfigPathFromManifest(manifest: ProviderManifest, workspaceRoot?: string): { path: string; source: "global" | "workspace" } {
    const globalPaths = manifest.configurationLocations
        .filter(l => l.type === "global")
        .map(l => resolvePathPattern(l.pathPattern, workspaceRoot));
    const workspacePaths = manifest.configurationLocations
        .filter(l => l.type === "workspace")
        .map(l => resolvePathPattern(l.pathPattern, workspaceRoot));

    // 1. Check workspace first if supported
    if (manifest.capabilities.supportsWorkspaceConfiguration && workspacePaths.length > 0) {
        for (const p of workspacePaths) {
            if (fs.existsSync(p)) {
                return { path: p, source: "workspace" };
            }
        }
    }

    // 2. Check global
    for (const p of globalPaths) {
        if (fs.existsSync(p)) {
            return { path: p, source: "global" };
        }
    }

    // 3. Fallback
    if (manifest.capabilities.supportsWorkspaceConfiguration && workspacePaths.length > 0) {
        return { path: workspacePaths[0], source: "workspace" };
    }
    if (globalPaths.length > 0) {
        return { path: globalPaths[0], source: "global" };
    }

    throw new Error(`No configuration paths resolved for provider "${manifest.providerId}".`);
}
