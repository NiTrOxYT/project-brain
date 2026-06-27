// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Base Provider Adapter
// Handles PTY spawn, stream forwarding, signal propagation, loop guard.
// Concrete adapters extend this and implement buildArgs() + metadata().
// ──────────────────────────────────────────────────────────────────────────────

import { execFile, spawn }  from "child_process";
import { promisify }        from "util";
import fs                  from "fs";
import path                from "path";
import type {
    ProviderAdapter,
    ProviderAdapterMetadata,
    ProviderHealthStatus,
    ProviderProcess,
    LaunchOptions,
    ExitResult,
} from "../types.js";
import {
    ProviderDetectionError,
    ProviderLaunchError,
    WrapperLoopError,
} from "../errors.js";
import { GlobalPaths } from "../global-paths.js";
import { Plugin, PluginKind } from "../../kernel/index.js";
import { AdapterRegistry } from "../adapter-registry.js";

const execFileAsync = promisify(execFile);

// ─── Stream helper ────────────────────────────────────────────────────────────

async function* streamChunks(
    stream: NodeJS.ReadableStream
): AsyncIterable<string> {
    for await (const chunk of stream) {
        yield (chunk as Buffer).toString("utf8");
    }
}

// ─── Base class ───────────────────────────────────────────────────────────────

export abstract class BaseProviderAdapter implements ProviderAdapter, Plugin {
    abstract readonly id:          string;
    abstract readonly displayName: string;
    abstract readonly version:     string;

    readonly kind: PluginKind = "provider";
    readonly apiVersion = "1.0.0";
    readonly pluginVersion = "1.0.0";
    readonly minimumKernelVersion = "0.1.0";

    async initialize(): Promise<void> {
        AdapterRegistry.register(this);
    }

    async shutdown(): Promise<void> {
        AdapterRegistry.unregister(this.id);
    }

    /** The binary name to search for in PATH (e.g. "claude", "codex"). */
    abstract readonly binaryName: string;

    /** Build the argument list for this provider given launch options. */
    protected abstract buildArgs(opts: LaunchOptions): string[];

    abstract metadata(): ProviderAdapterMetadata;

    capabilities(): ProviderAdapterMetadata["capabilities"] {
        return this.metadata().capabilities;
    }

    // ── Detection ─────────────────────────────────────────────────────────────

    async detect(): Promise<boolean> {
        try {
            await this.resolvedBinaryPath();
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Resolve the absolute path of the real provider binary.
     * Uses the manifest if wrappers are installed to prevent loop/recursion issues.
     * Otherwise uses `which` (POSIX) or `where` (Windows).
     */
    async resolvedBinaryPath(): Promise<string> {
        const gp = new GlobalPaths();
        const manifestPath = path.join(gp.wrappersDir, "manifest.json");

        // 1. Try manifest first to fetch direct real binary path if it exists
        if (fs.existsSync(manifestPath)) {
            try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
                const record = manifest.wrappers?.[this.id];
                if (record?.realBinaryPath && fs.existsSync(record.realBinaryPath)) {
                    return record.realBinaryPath;
                }
            } catch {
                // fallback to path resolution
            }
        }

        // 2. Perform PATH resolution
        const cmd  = process.platform === "win32" ? "where" : "which";
        let stdout: string;
        try {
            ({ stdout } = await execFileAsync(cmd, [this.binaryName]));
        } catch {
            throw new ProviderDetectionError(
                this.id,
                `${this.binaryName} not found in PATH`
            );
        }

        const resolved = stdout.trim().split(/\r?\n/)[0].trim();
        if (!resolved) {
            throw new ProviderDetectionError(
                this.id,
                `${this.binaryName} not found in PATH`
            );
        }

        // 3. Loop guard: if resolved is a wrapper in binDir, try reading from manifest
        if (gp.isInsideBin(resolved)) {
            if (fs.existsSync(manifestPath)) {
                try {
                    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
                    const record = manifest.wrappers?.[this.id];
                    if (record?.realBinaryPath) {
                        return record.realBinaryPath;
                    }
                } catch {}
            }
            throw new WrapperLoopError(this.id, resolved);
        }

        return resolved;
    }

    // ── Health ────────────────────────────────────────────────────────────────

    async health(): Promise<ProviderHealthStatus> {
        try {
            const detected = await this.detect();
            return detected ? "healthy" : "offline";
        } catch {
            return "unknown";
        }
    }

    // ── Launch ────────────────────────────────────────────────────────────────

    /**
     * Spawn the real provider binary as a child process.
     */
    async launch(opts: LaunchOptions): Promise<ProviderProcess> {
        let binaryPath = "";
        let errorDetails = "";

        try {
            binaryPath = await this.resolvedBinaryPath();
        } catch (err: any) {
            errorDetails = err.message;
        }

        // Pre-flight check: Exists & Executable
        let exists = false;
        let executable = false;
        if (binaryPath) {
            try {
                fs.accessSync(binaryPath, fs.constants.F_OK);
                exists = true;
                fs.accessSync(binaryPath, fs.constants.X_OK);
                executable = true;
            } catch {}
        }

        if (!exists || !executable) {
            const reason = !binaryPath ? errorDetails :
                           !exists ? "File does not exist" : "File is not executable (permission denied)";
            throw new ProviderLaunchError(
                this.id,
                `Provider: ${this.id}\n` +
                `Resolved Binary: ${binaryPath || "None"}\n` +
                `Exists: ${exists ? "YES" : "NO"}\n` +
                `Executable: ${executable ? "YES" : "NO"}\n` +
                `Spawn: FAILED\n` +
                `Reason: ${reason}`
            );
        }

        const args  = this.buildArgs(opts);
        const child = spawn(binaryPath, args, {
            stdio: ["inherit", "pipe", "pipe"],
            env:   { ...process.env, ...(opts.env ?? {}) },
        });

        // Listen for immediate asynchronous spawn errors (e.g. file missing on Windows, permission issues)
        const spawnPromise = new Promise<void>((resolve, reject) => {
            child.once("error", (err: any) => {
                reject(new ProviderLaunchError(
                    this.id,
                    `Provider: ${this.id}\n` +
                    `Resolved Binary: ${binaryPath}\n` +
                    `Exists: YES\n` +
                    `Executable: YES\n` +
                    `Spawn: FAILED\n` +
                    `Reason: ${err.message}`
                ));
            });
            // Give 50ms for error event to fire
            const t = setTimeout(() => resolve(), 50);
            child.once("spawn", () => {
                clearTimeout(t);
                resolve();
            });
        });

        await spawnPromise;

        if (!child.stdout || !child.stderr) {
            throw new ProviderLaunchError(
                this.id,
                "Failed to obtain process streams after spawn"
            );
        }

        // Forward SIGINT/SIGTERM from parent to child so Ctrl-C works correctly.
        const forwardSigint  = (): void => { child.kill("SIGINT");  };
        const forwardSigterm = (): void => { child.kill("SIGTERM"); };
        process.once("SIGINT",  forwardSigint);
        process.once("SIGTERM", forwardSigterm);

        const cleanupSignals = (): void => {
            process.off("SIGINT",  forwardSigint);
            process.off("SIGTERM", forwardSigterm);
        };

        child.once("close", cleanupSignals);

        return {
            pid:    child.pid ?? 0,
            stdout: streamChunks(child.stdout),
            stderr: streamChunks(child.stderr),

            cancel: async (): Promise<void> => {
                cleanupSignals();
                child.kill("SIGTERM");
                // Give process 500 ms to exit gracefully before SIGKILL.
                await new Promise<void>(resolve => {
                    const t = setTimeout(() => {
                        child.kill("SIGKILL");
                        resolve();
                    }, 500);
                    child.once("close", () => {
                        clearTimeout(t);
                        resolve();
                    });
                });
            },

            wait: (): Promise<ExitResult> =>
                new Promise(resolve => {
                    child.once("close", (code, signal) => {
                        cleanupSignals();
                        resolve({ code, signal });
                    });
                }),
        };
    }
}
