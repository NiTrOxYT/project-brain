// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061D — Installer — PATH Manager
// Orchestrates shell detection, PATH presence checks, interactive prompting,
// safe PATH modification, and shell-restart detection.
// ──────────────────────────────────────────────────────────────────────────────

import path from "path";
import readline from "readline";
import {
    type ShellProvider,
    type ShellInfo,
    detectShellProvider,
    ALL_SHELL_PROVIDERS,
} from "./shell-provider.js";

export interface PathCheckResult {
    inPath:     boolean;
    inConfig:   boolean;
    shellInfo:  ShellInfo;
    provider:   ShellProvider;
}

export interface PathUpdateResult {
    updated:       boolean;
    alreadyInPath: boolean;
    denied:        boolean;
    shellRestart:  boolean;
    instruction:   string;
}

export class PathManager {
    private readonly shellProvider: ShellProvider;
    private readonly binDir: string;

    constructor(binDir: string, shellProvider?: ShellProvider) {
        this.binDir        = binDir;
        this.shellProvider = shellProvider ?? detectShellProvider();
    }

    // ── Status ─────────────────────────────────────────────────────────────

    /**
     * Check whether binDir is in the runtime PATH and/or the shell config file.
     */
    check(env: NodeJS.ProcessEnv = process.env): PathCheckResult {
        return {
            inPath:    this.isInRuntimePath(env),
            inConfig:  this.shellProvider.isInConfig(this.binDir),
            shellInfo: this.shellProvider.getShellInfo(),
            provider:  this.shellProvider,
        };
    }

    /**
     * True if binDir is in the current process PATH (runtime check).
     * Normalises all entries to handle $HOME / ~ / absolute equivalences.
     */
    isInRuntimePath(env: NodeJS.ProcessEnv = process.env): boolean {
        const pathEnv = env.PATH ?? env.Path ?? "";
        const sep     = this.shellProvider.getShellInfo().pathSeparator;
        const normalBin = path.resolve(this.binDir);
        return pathEnv.split(sep).some(e => path.resolve(e) === normalBin);
    }

    // ── Modification ───────────────────────────────────────────────────────

    /**
     * Add binDir to the shell config.
     * In interactive mode (TTY), prompts the user for permission.
     * Returns a result describing what happened.
     */
    async addToPath(opts: {
        dryRun?:      boolean;
        interactive?: boolean;
        force?:       boolean;
    } = {}): Promise<PathUpdateResult> {
        const { dryRun = false, interactive = true, force = false } = opts;

        // Already configured
        if (this.shellProvider.isInConfig(this.binDir)) {
            const restartNeeded = !this.isInRuntimePath();
            return {
                updated:       false,
                alreadyInPath: true,
                denied:        false,
                shellRestart:  restartNeeded,
                instruction:   restartNeeded ? this.restartInstruction() : "",
            };
        }

        // Interactive prompt if TTY
        if (interactive && !force && process.stdin.isTTY) {
            const granted = await this.promptUser();
            if (!granted) {
                return {
                    updated:       false,
                    alreadyInPath: false,
                    denied:        true,
                    shellRestart:  false,
                    instruction:   this.manualInstruction(),
                };
            }
        }

        const wrote = this.shellProvider.addToPath(this.binDir, dryRun);

        return {
            updated:       wrote,
            alreadyInPath: !wrote,
            denied:        false,
            shellRestart:  wrote && !this.isInRuntimePath(),
            instruction:   wrote ? this.restartInstruction() : "",
        };
    }

    /**
     * Remove binDir from the shell config.
     */
    removeFromPath(dryRun = false): boolean {
        return this.shellProvider.removeFromPath(this.binDir, dryRun);
    }

    // ── Shell Restart Detection ────────────────────────────────────────────

    /**
     * Check whether the current shell has the new PATH.
     * If not, returns shell-specific instructions.
     */
    detectRestart(): { needed: boolean; instruction: string } {
        if (this.isInRuntimePath()) {
            return { needed: false, instruction: "" };
        }
        return { needed: true, instruction: this.restartInstruction() };
    }

    // ── Private ────────────────────────────────────────────────────────────

    private restartInstruction(): string {
        const info = this.shellProvider.getShellInfo();
        switch (info.shell) {
            case "zsh":
                return `Run: source ~/.zshrc  or  exec $SHELL -l`;
            case "bash":
                return `Run: source ~/.bashrc  or  exec $SHELL -l`;
            case "fish":
                return `Run: source ~/.config/fish/config.fish  or restart your terminal`;
            case "powershell":
                return `Restart your PowerShell session or run: . $PROFILE`;
            case "cmd":
                return `Restart your Command Prompt`;
            case "nushell":
                return `Restart your Nushell session`;
        }
    }

    private manualInstruction(): string {
        const info = this.shellProvider.getShellInfo();
        if (info.shell === "cmd") {
            return `Add %USERPROFILE%\\.project-brain\\bin to your system PATH manually.`;
        }
        return `Add the following to ${info.configFile}:\n  export PATH="$HOME/.project-brain/bin:$PATH"`;
    }

    private async promptUser(): Promise<boolean> {
        const info = this.shellProvider.getShellInfo();
        const rl = readline.createInterface({
            input:  process.stdin,
            output: process.stderr,
        });

        return new Promise<boolean>((resolve) => {
            rl.question(
                `\nProject Brain needs to add:\n` +
                `  ~/.project-brain/bin\n` +
                `to your PATH so provider wrappers work correctly.\n` +
                `Modify ${info.configFile} automatically? [Y/n] `,
                (answer) => {
                    rl.close();
                    const a = answer.trim().toLowerCase();
                    resolve(a === "" || a === "y" || a === "yes");
                }
            );
        });
    }
}
