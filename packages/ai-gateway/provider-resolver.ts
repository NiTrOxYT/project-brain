// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061D-HOTFIX-V2 — AI Gateway — Provider Resolver Service
// The single source of truth for resolving, discovering, and repairing
// provider paths across the entire Project Brain system.
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { GlobalPaths } from "../kernel/paths.js";
import { AdapterRegistry } from "./adapter-registry.js";
import type { ProviderHealthStatus } from "../domain/index.js";

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface ProviderResolution {
    providerId:       string;
    wrapperPath?:     string;
    manifestPath?:    string;
    storedBinary?:    string;
    resolvedBinary?:  string;
    executableExists: boolean;
    executable:       boolean;
    version?:         string;
    source:           "manifest" | "system-path" | "manifest-repair" | "not-found";
    wrapperVersion?:  string;
    providerVersion?: string;
}

// Helper to compute checksum
function checksumContent(content: string): string {
    return crypto.createHash("sha256").update(content, "utf8").digest("hex").slice(0, 16);
}

// In-process cross-platform PATH search
function searchPath(binaryName: string, excludeDir?: string): string | null {
    const pathEnv = process.env.PATH ?? process.env.Path ?? "";
    const delimiter = process.platform === "win32" ? ";" : ":";
    const entries = pathEnv.split(delimiter);
    const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ".lnk", ""] : [""];
    const normalExclude = excludeDir ? path.resolve(excludeDir) : null;

    for (const entry of entries) {
        if (!entry) continue;
        const normalEntry = path.resolve(entry.trim());
        if (normalExclude && normalEntry === normalExclude) continue;

        for (const ext of extensions) {
            const fullPath = path.join(normalEntry, `${binaryName}${ext}`);
            try {
                fs.accessSync(fullPath, fs.constants.F_OK | fs.constants.X_OK);
                // Verify it's not a directory
                if (!fs.statSync(fullPath).isDirectory()) {
                    return fullPath;
                }
            } catch {
                // Not found or not executable
            }
        }
    }
    return null;
}

export class ProviderResolverService {
    private readonly paths: GlobalPaths;

    constructor(paths?: GlobalPaths) {
        this.paths = paths ?? new GlobalPaths();
    }

    // ─── Resolve ─────────────────────────────────────────────────────────────

    async resolve(providerId: string): Promise<ProviderResolution> {
        const adapter = AdapterRegistry.lookup(providerId);
        const binaryName = adapter.binaryName;

        const wrapperPath = this.paths.binEntry(providerId);
        const manifestPath = path.join(this.paths.wrappersDir, "manifest.json");

        let storedBinary: string | undefined;
        let manifestRecord: any = null;
        let wrapperVersion: string | undefined;
        let providerVersion: string | undefined;

        // Read manifest
        if (fs.existsSync(manifestPath)) {
            try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
                manifestRecord = manifest.wrappers?.[providerId];
                if (manifestRecord) {
                    storedBinary = manifestRecord.realBinaryPath;
                    wrapperVersion = manifestRecord.wrapperVersion;
                    providerVersion = manifestRecord.providerVersion;
                }
            } catch {}
        }

        // 1. Stored manifest binary exists?
        if (storedBinary) {
            try {
                fs.accessSync(storedBinary, fs.constants.F_OK | fs.constants.X_OK);
                return {
                    providerId,
                    wrapperPath,
                    manifestPath,
                    storedBinary,
                    resolvedBinary: storedBinary,
                    executableExists: true,
                    executable: true,
                    version: adapter.version,
                    source: "manifest",
                    wrapperVersion,
                    providerVersion,
                };
            } catch {
                // Binary deleted or moved — proceed to PATH check + repair
            }
        }

        // 2. Search PATH
        const resolvedOnPath = searchPath(binaryName);
        let finalBinary: string | null = null;
        let repaired = false;

        if (resolvedOnPath) {
            const isWrapper = this.paths.isInsideBin(resolvedOnPath);
            if (isWrapper) {
                // Resolved wrapper on PATH, but storedBinary is invalid/missing.
                // Search PATH excluding Brain's bin directory.
                finalBinary = searchPath(binaryName, this.paths.binDir);
                if (finalBinary && manifestRecord) {
                    await this.repair(providerId, finalBinary);
                    repaired = true;
                }
            } else {
                // Direct binary found on PATH.
                finalBinary = resolvedOnPath;
                if (manifestRecord && storedBinary !== finalBinary) {
                    await this.repair(providerId, finalBinary);
                    repaired = true;
                }
            }
        }

        if (finalBinary) {
            return {
                providerId,
                wrapperPath,
                manifestPath,
                storedBinary: finalBinary,
                resolvedBinary: finalBinary,
                executableExists: true,
                executable: true,
                version: adapter.version,
                source: repaired ? "manifest-repair" : "system-path",
                wrapperVersion: repaired ? manifestRecord?.wrapperVersion : wrapperVersion,
                providerVersion: repaired ? manifestRecord?.providerVersion : providerVersion,
            };
        }

        // 3. Fallback to adapter's own custom resolution method if overridden
        const isBaseMethod = adapter.resolvedBinaryPath.toString().includes("ProviderResolverService");
        if (!isBaseMethod) {
            try {
                const adapterBin = await adapter.resolvedBinaryPath();
                if (adapterBin) {
                    fs.accessSync(adapterBin, fs.constants.F_OK | fs.constants.X_OK);
                    return {
                        providerId,
                        wrapperPath,
                        manifestPath,
                        storedBinary: adapterBin,
                        resolvedBinary: adapterBin,
                        executableExists: true,
                        executable: true,
                        version: adapter.version,
                        source: "manifest",
                        wrapperVersion,
                        providerVersion,
                    };
                }
            } catch {}
        }

        // If manifest record exists, but binary is not found anywhere
        return {
            providerId,
            wrapperPath,
            manifestPath,
            storedBinary,
            resolvedBinary: undefined,
            executableExists: false,
            executable: false,
            version: adapter.version,
            source: "not-found",
        };
    }

    // ─── Discover ────────────────────────────────────────────────────────────

    async discover(): Promise<ProviderResolution[]> {
        const adapters = AdapterRegistry.list();
        const list: ProviderResolution[] = [];
        for (const a of adapters) {
            try {
                const res = await this.resolve(a.id);
                list.push(res);
            } catch {
                list.push({
                    providerId: a.id,
                    executableExists: false,
                    executable: false,
                    source: "not-found",
                });
            }
        }
        return list;
    }

    // ─── Health ──────────────────────────────────────────────────────────────

    async health(providerId: string): Promise<ProviderHealthStatus> {
        try {
            const res = await this.resolve(providerId);
            return res.executableExists && res.executable ? "healthy" : "offline";
        } catch {
            return "unknown";
        }
    }

    // ─── Repair ──────────────────────────────────────────────────────────────

    async repair(providerId: string, realBinaryPath: string): Promise<void> {
        const adapter = AdapterRegistry.lookup(providerId);
        const wrapperFile = this.paths.wrapperScript(providerId);
        const binFile = this.paths.binEntry(providerId);
        const manifestPath = path.join(this.paths.wrappersDir, "manifest.json");

        // Make sure parent folders exist
        fs.mkdirSync(this.paths.wrappersDir, { recursive: true });
        fs.mkdirSync(this.paths.binDir, { recursive: true });

        // 1. Write the wrapper script
        const content = `#!/bin/sh
# ──────────────────────────────────────────────────────────────────────────────
# ${providerId} — Project Brain transparent wrapper
# Generated by: brain install (v1.0.0)
# DO NOT EDIT — run \`brain install --repair\` to regenerate
# ──────────────────────────────────────────────────────────────────────────────
# wrapper_version=1.0.0
# provider=${providerId}
# created_at=${new Date().toISOString()}
# real_binary=${realBinaryPath}
# ──────────────────────────────────────────────────────────────────────────────
exec brain gateway run --provider ${providerId} -- "$@"
`;

        const tmpPath = wrapperFile + ".tmp-" + process.pid;
        try {
            fs.writeFileSync(tmpPath, content, { encoding: "utf8", mode: 0o755 });
            fs.renameSync(tmpPath, wrapperFile);
        } catch (err) {
            if (fs.existsSync(tmpPath)) fs.rmSync(tmpPath, { force: true });
            throw err;
        }

        // 2. Create link in bin
        if (fs.existsSync(binFile)) {
            fs.rmSync(binFile, { force: true });
        }
        if (process.platform === "win32") {
            const contentWin = `@echo off
:: ${providerId}.cmd — Project Brain transparent wrapper
:: Generated by: brain install (v1.0.0)
:: DO NOT EDIT
brain gateway run --provider ${providerId} -- %*
`;
            fs.writeFileSync(binFile, contentWin, "utf8");
        } else {
            fs.symlinkSync(wrapperFile, binFile);
        }

        // 3. Update manifest
        let manifest: any = { version: "1", wrappers: {}, updatedAt: new Date().toISOString() };
        if (fs.existsSync(manifestPath)) {
            try {
                manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
            } catch {}
        }

        manifest.wrappers[providerId] = {
            provider:         providerId,
            version:          adapter.version,
            checksum:         checksumContent(content),
            createdAt:        new Date().toISOString(),
            installerVersion: "1.0.0",
            wrapperPath:      binFile,
            realBinaryPath,
        };
        manifest.updatedAt = new Date().toISOString();

        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    }
}
