// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061D — Installer — Self-Healing Installer Engine
// Orchestrates provider discovery, wrapper generation, PATH management,
// diagnostics, and self-repair with transactional rollback.
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { GlobalPaths, type KernelContext } from "../kernel/index.js";
import { AdapterRegistry } from "../ai-gateway/adapter-registry.js";
import { ProviderResolverService, type ProviderResolution } from "../ai-gateway/provider-resolver.js";
import { ManifestManager, checksumContent, type WrapperRecord } from "./manifest.js";
import { PathManager, type PathUpdateResult } from "./path-manager.js";
import { type ShellProvider, type ShellInfo, detectShellProvider } from "./shell-provider.js";

// ─── Constants ───────────────────────────────────────────────────────────────

export const INSTALLER_VERSION = "1.0.0";

// ─── Options & Result Types ──────────────────────────────────────────────────

export interface InstallerRunOptions {
    dryRun?:      boolean;
    repair?:      boolean;
    uninstall?:   boolean;
    interactive?: boolean;
    providerId?:  string;
    binDir?:      string;
}

export interface ProviderDiscoveryResult {
    id:            string;
    displayName:   string;
    binaryName:    string;
    binaryPath:    string;
    version:       string;
    status:        "new" | "current" | "outdated" | "corrupted" | "missing";
}

export interface WrapperGenerationResult {
    id:           string;
    wrapperPath:  string;
    action:       "created" | "updated" | "skipped" | "repaired";
}

export interface RemovedProviderResult {
    id:     string;
    action: "archived" | "removed";
}

export interface InstallerResult {
    discovered:     ProviderDiscoveryResult[];
    generated:      WrapperGenerationResult[];
    removed:        RemovedProviderResult[];
    pathResult:     PathUpdateResult | null;
    diagnostics:    DiagnosticCheck[];
    warnings:       string[];
    installerVersion: string;
}

export interface DiagnosticCheck {
    name:   string;
    status: "pass" | "warn" | "fail";
    detail: string;
}

// ─── Exit Codes ──────────────────────────────────────────────────────────────

export const EXIT_SUCCESS              = 0;
export const EXIT_FATAL                = 1;
export const EXIT_SHELL_CONFIG_DENIED  = 2;
export const EXIT_PROVIDER_DISCOVERY   = 3;
export const EXIT_WRAPPER_VALIDATION   = 4;

// ─── Lock ────────────────────────────────────────────────────────────────────

class InstallerLock {
    private readonly lockPath: string;
    private acquired = false;

    constructor(rootDir: string) {
        this.lockPath = path.join(rootDir, "install.lock");
    }

    acquire(): boolean {
        fs.mkdirSync(path.dirname(this.lockPath), { recursive: true });
        if (fs.existsSync(this.lockPath)) {
            try {
                const content = JSON.parse(fs.readFileSync(this.lockPath, "utf8"));
                const age = Date.now() - new Date(content.startedAt).getTime();
                // Stale lock (> 5 min)
                if (age > 300_000) {
                    fs.rmSync(this.lockPath, { force: true });
                } else {
                    return false;
                }
            } catch {
                fs.rmSync(this.lockPath, { force: true });
            }
        }
        fs.writeFileSync(this.lockPath, JSON.stringify({
            pid: process.pid,
            startedAt: new Date().toISOString(),
        }), "utf8");
        this.acquired = true;
        return true;
    }

    release(): void {
        if (this.acquired && fs.existsSync(this.lockPath)) {
            fs.rmSync(this.lockPath, { force: true });
            this.acquired = false;
        }
    }
}

// ─── Transaction Journal ─────────────────────────────────────────────────────

interface RollbackEntry {
    type:    "file_created" | "file_modified" | "file_deleted" | "dir_created";
    path:    string;
    backup?: string;
}

class TransactionJournal {
    private entries: RollbackEntry[] = [];

    recordCreated(filePath: string): void {
        this.entries.push({ type: "file_created", path: filePath });
    }

    recordModified(filePath: string): void {
        if (fs.existsSync(filePath)) {
            const backup = filePath + ".bak-" + Date.now();
            fs.copyFileSync(filePath, backup);
            this.entries.push({ type: "file_modified", path: filePath, backup });
        }
    }

    recordDirCreated(dirPath: string): void {
        this.entries.push({ type: "dir_created", path: dirPath });
    }

    rollback(): void {
        // Undo in reverse order
        for (const entry of [...this.entries].reverse()) {
            try {
                switch (entry.type) {
                    case "file_created":
                        if (fs.existsSync(entry.path)) fs.rmSync(entry.path, { force: true });
                        break;
                    case "file_modified":
                        if (entry.backup && fs.existsSync(entry.backup)) {
                            fs.copyFileSync(entry.backup, entry.path);
                            fs.rmSync(entry.backup, { force: true });
                        }
                        break;
                    case "dir_created":
                        // Only remove if empty
                        try { fs.rmdirSync(entry.path); } catch { /* not empty */ }
                        break;
                }
            } catch { /* best effort */ }
        }
        this.entries = [];
    }

    commit(): void {
        // Clean up backups
        for (const entry of this.entries) {
            if (entry.backup && fs.existsSync(entry.backup)) {
                fs.rmSync(entry.backup, { force: true });
            }
        }
        this.entries = [];
    }
}

// ─── Installer Engine ────────────────────────────────────────────────────────

export class BrainInstaller {
    private readonly paths:     GlobalPaths;
    private readonly manifest:  ManifestManager;
    private readonly lock:      InstallerLock;
    private readonly ctx?:      KernelContext;

    constructor(ctxOrPaths?: KernelContext | GlobalPaths) {
        if (ctxOrPaths && "globalPaths" in ctxOrPaths) {
            this.ctx   = ctxOrPaths;
            this.paths = ctxOrPaths.globalPaths;
        } else {
            this.paths = ctxOrPaths ?? new GlobalPaths();
        }
        this.manifest = new ManifestManager(this.paths.wrappersDir);
        this.lock     = new InstallerLock(this.paths.root);
    }

    async install(opts: InstallerRunOptions = {}): Promise<InstallerResult> {
        const result: InstallerResult = {
            discovered:       [],
            generated:        [],
            removed:          [],
            pathResult:       null,
            diagnostics:      [],
            warnings:         [],
            installerVersion: INSTALLER_VERSION,
        };

        const dryRun = opts.dryRun ?? false;

        // ── Lock ─────────────────────────────────────────────────────────
        if (!dryRun) {
            if (!this.lock.acquire()) {
                result.warnings.push("Another brain install process is running. Aborting.");
                return result;
            }
        }

        const journal = new TransactionJournal();

        try {
            // ── Uninstall ────────────────────────────────────────────────
            if (opts.uninstall) {
                await this.handleUninstall(dryRun, result, journal);
                if (!dryRun) journal.commit();
                return result;
            }

            // ── Step 1: Ensure directories ───────────────────────────────
            if (!dryRun) {
                for (const dir of this.paths.allDirs()) {
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                        journal.recordDirCreated(dir);
                    }
                }
                // Additional directories from requirements
                for (const sub of ["timeline"]) {
                    const d = path.join(this.paths.root, sub);
                    if (!fs.existsSync(d)) {
                        fs.mkdirSync(d, { recursive: true });
                        journal.recordDirCreated(d);
                    }
                }
            }

            // ── Step 2: Discover providers ───────────────────────────────
            const resolver = new ProviderResolverService(this.paths);
            const resolutions = await resolver.discover();
            const targets = opts.providerId
                ? resolutions.filter(r => r.providerId === opts.providerId)
                : resolutions;

            if (opts.providerId && targets.length === 0) {
                result.warnings.push(`Provider "${opts.providerId}" is not registered.`);
            }

            for (const res of targets) {
                const adapter = AdapterRegistry.lookup(res.providerId);
                if (res.resolvedBinary) {
                    const manifestStatus = this.manifest.verifyWrapper(
                        res.providerId, INSTALLER_VERSION
                    );

                    const status: ProviderDiscoveryResult["status"] =
                        manifestStatus === "ok"        ? "current"   :
                        manifestStatus === "untracked" ? "new"       :
                        manifestStatus as any;

                    result.discovered.push({
                        id:          res.providerId,
                        displayName: adapter.displayName,
                        binaryName:  adapter.binaryName,
                        binaryPath:  res.resolvedBinary,
                        version:     adapter.version,
                        status,
                    });
                }
            }

            if (result.discovered.length === 0 && !opts.repair) {
                result.warnings.push("No providers discovered in PATH.");
            }

            // ── Step 3: Generate / Repair wrappers ───────────────────────
            for (const disc of result.discovered) {
                const genResult = await this.generateWrapper(
                    disc, dryRun, opts.repair ?? false, journal
                );
                result.generated.push(genResult);
            }

            // ── Step 4: Detect removed providers ─────────────────────────
            const manifestProviders = this.manifest.listProviders();
            const discoveredIds     = new Set(result.discovered.map(d => d.id));
            for (const existing of manifestProviders) {
                if (!discoveredIds.has(existing)) {
                    result.removed.push(
                        this.handleRemovedProvider(existing, dryRun, journal)
                    );
                }
            }

            // ── Step 5: PATH management ──────────────────────────────────
            const pathManager = new PathManager(this.paths.binDir);
            result.pathResult = await pathManager.addToPath({
                dryRun,
                interactive: opts.interactive ?? true,
                force:       opts.repair,
            });

            // ── Step 6: Diagnostics ──────────────────────────────────────
            result.diagnostics = this.runDiagnostics(result);

            // ── Step 7: Version-aware upgrade check ──────────────────────
            if (!dryRun) {
                this.checkInstallerVersionUpgrade();
            }

            // ── Commit transaction ───────────────────────────────────────
            if (!dryRun) journal.commit();

        } catch (err: any) {
            // ── Rollback on failure ──────────────────────────────────────
            if (!dryRun) journal.rollback();
            result.warnings.push(`Installation failed, rolled back: ${err.message}`);
        } finally {
            if (!dryRun) this.lock.release();
        }

        return result;
    }

    // ─── Wrapper Generation ──────────────────────────────────────────────────

    private async generateWrapper(
        disc:    ProviderDiscoveryResult,
        dryRun:  boolean,
        repair:  boolean,
        journal: TransactionJournal,
    ): Promise<WrapperGenerationResult> {
        const wrapperPath = this.paths.wrapperScript(disc.id);
        const binPath     = this.paths.binEntry(disc.id);

        // Determine if update is needed
        if (disc.status === "current" && !repair) {
            return { id: disc.id, wrapperPath: binPath, action: "skipped" };
        }

        if (dryRun) {
            const action = disc.status === "new" ? "created" :
                           repair ? "repaired" : "updated";
            return { id: disc.id, wrapperPath: binPath, action };
        }

        // Generate wrapper content with metadata header
        const content = this.generateWrapperContent(disc.id, disc.binaryPath);

        // Atomic write: write to temp, then rename
        const tmpPath = wrapperPath + ".tmp-" + process.pid;
        try {
            if (fs.existsSync(wrapperPath)) {
                journal.recordModified(wrapperPath);
            }
            fs.writeFileSync(tmpPath, content, { encoding: "utf8", mode: 0o755 });
            fs.renameSync(tmpPath, wrapperPath);
            journal.recordCreated(wrapperPath);
        } catch (err) {
            // Clean up temp
            if (fs.existsSync(tmpPath)) fs.rmSync(tmpPath, { force: true });
            throw err;
        }

        // Create bin symlink / cmd shim
        if (fs.existsSync(binPath)) {
            journal.recordModified(binPath);
            fs.rmSync(binPath, { force: true });
        }
        if (process.platform === "win32") {
            fs.writeFileSync(binPath, this.generateWrapperContentWin(disc.id), "utf8");
        } else {
            fs.symlinkSync(wrapperPath, binPath);
        }
        journal.recordCreated(binPath);

        // Update manifest
        const adapter = AdapterRegistry.lookup(disc.id);
        const record: WrapperRecord = {
            provider:         disc.id,
            version:          disc.version,
            checksum:         checksumContent(content),
            createdAt:        new Date().toISOString(),
            installerVersion: INSTALLER_VERSION,
            wrapperPath:      binPath,
            realBinaryPath:   disc.binaryPath,

            // BUILD-061E fields
            wrapperVersion:       INSTALLER_VERSION,
            providerVersion:      disc.version,
            providerBinary:       disc.binaryPath,
            providerCapabilities: adapter.capabilities(),
            passthroughCommands:  adapter.passthroughCommands(),
            gatewayCommands:      adapter.gatewayCommands(),
            generatedAt:          new Date().toISOString(),
        };
        this.manifest.set(disc.id, record);

        const action = disc.status === "new" ? "created" :
                       repair ? "repaired" : "updated";
        return { id: disc.id, wrapperPath: binPath, action };
    }

    private generateWrapperContent(providerId: string, realBinaryPath: string): string {
        return `#!/bin/sh
# ──────────────────────────────────────────────────────────────────────────────
# ${providerId} — Project Brain transparent wrapper
# Generated by: brain install (v${INSTALLER_VERSION})
# DO NOT EDIT — run \`brain install --repair\` to regenerate
# ──────────────────────────────────────────────────────────────────────────────
# wrapper_version=${INSTALLER_VERSION}
# provider=${providerId}
# created_at=${new Date().toISOString()}
# real_binary=${realBinaryPath}
# ──────────────────────────────────────────────────────────────────────────────
exec brain dispatch --provider ${providerId} -- "$@"
`;
    }

    private generateWrapperContentWin(providerId: string): string {
        return `@echo off
:: ${providerId}.cmd — Project Brain transparent wrapper
:: Generated by: brain install (v${INSTALLER_VERSION})
:: DO NOT EDIT
brain dispatch --provider ${providerId} -- %*
`;
    }

    // ─── Removed Provider Handling ───────────────────────────────────────────

    private handleRemovedProvider(
        providerId: string,
        dryRun:     boolean,
        journal:    TransactionJournal,
    ): RemovedProviderResult {
        if (dryRun) return { id: providerId, action: "archived" };

        // Remove wrapper files
        const wrapperPath = this.paths.wrapperScript(providerId);
        const binPath     = this.paths.binEntry(providerId);

        if (fs.existsSync(binPath)) {
            journal.recordModified(binPath);
            fs.rmSync(binPath, { force: true });
        }
        if (fs.existsSync(wrapperPath)) {
            journal.recordModified(wrapperPath);
            fs.rmSync(wrapperPath, { force: true });
        }

        this.manifest.remove(providerId);
        return { id: providerId, action: "removed" };
    }

    // ─── Uninstall ───────────────────────────────────────────────────────────

    private async handleUninstall(
        dryRun:  boolean,
        result:  InstallerResult,
        journal: TransactionJournal,
    ): Promise<void> {
        const providers = this.manifest.listProviders();
        for (const id of providers) {
            const removed = this.handleRemovedProvider(id, dryRun, journal);
            result.removed.push(removed);
        }
        // Remove PATH entry
        if (!dryRun) {
            const pathManager = new PathManager(this.paths.binDir);
            pathManager.removeFromPath();
        }
    }

    // ─── Diagnostics ─────────────────────────────────────────────────────────

    private runDiagnostics(result: InstallerResult): DiagnosticCheck[] {
        const checks: DiagnosticCheck[] = [];

        // Global directories
        const allDirsExist = this.paths.allDirs().every(d => fs.existsSync(d));
        checks.push({
            name:   "Global directories",
            status: allDirsExist ? "pass" : "fail",
            detail: allDirsExist ? "All directories exist" : "Some directories missing",
        });

        // PATH
        const pathManager = new PathManager(this.paths.binDir);
        const pathCheck   = pathManager.check();
        checks.push({
            name:   "PATH configured",
            status: pathCheck.inPath ? "pass" : (pathCheck.inConfig ? "warn" : "fail"),
            detail: pathCheck.inPath
                ? "PATH contains ~/.project-brain/bin"
                : pathCheck.inConfig
                    ? "PATH entry in config but shell restart needed"
                    : "PATH not configured",
        });

        // Wrapper integrity
        for (const disc of result.discovered) {
            const status = this.manifest.verifyWrapper(disc.id, INSTALLER_VERSION);
            checks.push({
                name:   `Wrapper: ${disc.id}`,
                status: status === "ok" ? "pass" : "warn",
                detail: status,
            });
        }

        // Wrapper execution validation
        for (const gen of result.generated) {
            if (gen.action === "skipped" && !fs.existsSync(gen.wrapperPath)) continue;
            const execCheck = this.validateWrapperExecution(gen.id);
            checks.push(execCheck);
        }

        return checks;
    }

    /**
     * Validate a wrapper by attempting to execute a lightweight command through it.
     * Uses `which` to verify the wrapper resolves correctly.
     */
    private validateWrapperExecution(providerId: string): DiagnosticCheck {
        const binPath = this.paths.binEntry(providerId);
        try {
            if (!fs.existsSync(binPath)) {
                return { name: `Exec: ${providerId}`, status: "fail", detail: "Wrapper not found" };
            }

            // Verify the `which` resolution points to our bin dir
            const cmd = process.platform === "win32" ? "where" : "which";
            const resolved = execFileSync(cmd, [providerId], {
                encoding: "utf8",
                env: { ...process.env, PATH: this.paths.binDir + path.delimiter + (process.env.PATH ?? "") },
                timeout: 5000,
            }).trim().split(/\r?\n/)[0].trim();

            if (this.paths.isInsideBin(resolved)) {
                return { name: `Exec: ${providerId}`, status: "pass", detail: `Resolves to ${resolved}` };
            }
            return { name: `Exec: ${providerId}`, status: "warn", detail: `Resolves to ${resolved}, not inside bin/` };
        } catch {
            return { name: `Exec: ${providerId}`, status: "warn", detail: "Could not verify wrapper execution" };
        }
    }

    // ─── Version-Aware Upgrades ──────────────────────────────────────────────

    private checkInstallerVersionUpgrade(): void {
        if (!fs.existsSync(this.paths.configPath)) return;
        try {
            const config = JSON.parse(fs.readFileSync(this.paths.configPath, "utf8"));
            const previousVersion = config.installerVersion;
            if (previousVersion && previousVersion !== INSTALLER_VERSION) {
                // Run migration — for now, force repair of all wrappers
                this.migrateWrappers(previousVersion);
            }
            config.installerVersion = INSTALLER_VERSION;
            fs.writeFileSync(this.paths.configPath, JSON.stringify(config, null, 2), "utf8");
        } catch {
            // No migration needed if config is unreadable
        }
    }

    private migrateWrappers(_fromVersion: string): void {
        // Future: version-specific migration logic
        // Currently: regenerating wrappers on version change is handled
        // by the manifest verifyWrapper returning "outdated"
    }
}
