// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Installer
// Handles: provider discovery, absolute path resolution, wrapper generation,
// PATH verification, loop guard, dry-run, repair, and uninstallation.
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import { GlobalPaths } from "./global-paths.js";
import { AdapterRegistry } from "./adapter-registry.js";
import { InstallationError, WrapperLoopError } from "./errors.js";
export class GatewayInstaller {
    paths;
    constructor(paths) {
        this.paths = paths ?? new GlobalPaths();
    }
    /**
     * Run the installation / update / uninstallation flow.
     */
    async install(opts = {}) {
        const result = {
            discovered: [],
            generated: [],
            warnings: [],
            uninstalled: [],
        };
        // Determine destination bin directory
        const binDir = opts.binDir ? path.resolve(opts.binDir) : this.paths.binDir;
        // ─── Uninstall ────────────────────────────────────────────────────────
        if (opts.uninstall) {
            await this.handleUninstall(opts.dryRun ?? false, result);
            return result;
        }
        // Ensure directories exist
        if (!opts.dryRun) {
            for (const dir of this.paths.allDirs()) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
        // Load existing global config
        const config = this.loadConfig();
        // ─── Discover & Validate Providers ────────────────────────────────────
        const adapters = AdapterRegistry.list();
        const targets = opts.providerId
            ? adapters.filter(a => a.id === opts.providerId)
            : adapters;
        if (opts.providerId && targets.length === 0) {
            throw new InstallationError(`Provider "${opts.providerId}" is not supported.`);
        }
        for (const adapter of targets) {
            try {
                // Perform loop guard detection before doing anything
                const realBinaryPath = await adapter.resolvedBinaryPath();
                // Double check loop guard using GlobalPaths
                if (this.paths.isInsideBin(realBinaryPath)) {
                    throw new WrapperLoopError(adapter.id, realBinaryPath);
                }
                result.discovered.push({
                    id: adapter.id,
                    binaryPath: realBinaryPath,
                    version: adapter.version,
                });
                // Generate wrapper script paths
                const wrapperPath = this.paths.wrapperScript(adapter.id);
                const binPath = this.paths.binEntry(adapter.id);
                if (!opts.dryRun) {
                    // Generate wrapper script content
                    const wrapperContent = this.generateWrapperContent(adapter.id);
                    fs.writeFileSync(wrapperPath, wrapperContent, { encoding: "utf8", mode: 0o755 });
                    // Create symlink or script copy in bin/
                    if (fs.existsSync(binPath)) {
                        fs.rmSync(binPath, { force: true });
                    }
                    if (process.platform === "win32") {
                        // Windows: write batch shim directly into bin/
                        fs.writeFileSync(binPath, this.generateWrapperContentWin(adapter.id), "utf8");
                    }
                    else {
                        // POSIX: create symlink from bin/ to wrappers/
                        fs.symlinkSync(wrapperPath, binPath);
                    }
                    // Update config
                    const reg = {
                        id: adapter.id,
                        binaryPath: realBinaryPath,
                        wrapperPath: binPath,
                        installedAt: new Date().toISOString(),
                        enabled: true,
                        version: adapter.version,
                    };
                    config.installedProviders[adapter.id] = reg;
                }
                result.generated.push({
                    id: adapter.id,
                    wrapperPath: binPath,
                });
            }
            catch (err) {
                if (err instanceof WrapperLoopError) {
                    throw err;
                }
                // Degrade warnings for providers that aren't in PATH (not found)
                result.warnings.push(`Could not install "${adapter.id}": ${err.message}`);
            }
        }
        // Persist config if not dry run
        if (!opts.dryRun) {
            config.lastUpdated = new Date().toISOString();
            this.saveConfig(config);
        }
        // ─── PATH check ───────────────────────────────────────────────────────
        if (!this.paths.isBinInPath()) {
            result.warnings.push(`Project Brain bin directory "${binDir}" is not in your PATH. ` +
                `Add this to your shell config (e.g. ~/.zshrc or ~/.bashrc):\n` +
                `  export PATH="${binDir}:$PATH"`);
        }
        return result;
    }
    // ─── Helpers ──────────────────────────────────────────────────────────────
    loadConfig() {
        if (!fs.existsSync(this.paths.configPath)) {
            return {
                version: "1",
                installedProviders: {},
                binDir: this.paths.binDir,
                wrappersDir: this.paths.wrappersDir,
                lastUpdated: new Date().toISOString(),
            };
        }
        try {
            return JSON.parse(fs.readFileSync(this.paths.configPath, "utf8"));
        }
        catch {
            return {
                version: "1",
                installedProviders: {},
                binDir: this.paths.binDir,
                wrappersDir: this.paths.wrappersDir,
                lastUpdated: new Date().toISOString(),
            };
        }
    }
    saveConfig(config) {
        fs.writeFileSync(this.paths.configPath, JSON.stringify(config, null, 2), "utf8");
    }
    generateWrapperContent(providerId) {
        return `#!/bin/sh
# ${providerId} — Project Brain transparent wrapper
# Generated by: brain install
# DO NOT EDIT — run \`brain install --repair\` to regenerate
exec brain gateway run --provider ${providerId} -- "$@"
`;
    }
    generateWrapperContentWin(providerId) {
        return `@echo off
:: ${providerId}.cmd — Project Brain transparent wrapper
:: Generated by: brain install
brain gateway run --provider ${providerId} -- %*
`;
    }
    async handleUninstall(dryRun, result) {
        if (!fs.existsSync(this.paths.configPath))
            return;
        const config = this.loadConfig();
        for (const [id, reg] of Object.entries(config.installedProviders)) {
            result.uninstalled.push(id);
            if (!dryRun) {
                // Delete wrapper
                if (fs.existsSync(reg.wrapperPath)) {
                    fs.rmSync(reg.wrapperPath, { force: true });
                }
                const localWrapper = this.paths.wrapperScript(id);
                if (fs.existsSync(localWrapper)) {
                    fs.rmSync(localWrapper, { force: true });
                }
            }
        }
        if (!dryRun) {
            // Clear config
            config.installedProviders = {};
            config.lastUpdated = new Date().toISOString();
            this.saveConfig(config);
        }
    }
}
