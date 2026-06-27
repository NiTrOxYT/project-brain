// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061D — Installer — PATH Manager
// Orchestrates shell detection, PATH presence checks, interactive prompting,
// safe PATH modification, and shell-restart detection.
// ──────────────────────────────────────────────────────────────────────────────
import path from "path";
import readline from "readline";
import { detectShellProvider, } from "./shell-provider.js";
export class PathManager {
    shellProvider;
    binDir;
    constructor(binDir, shellProvider) {
        this.binDir = binDir;
        this.shellProvider = shellProvider ?? detectShellProvider();
    }
    // ── Status ─────────────────────────────────────────────────────────────
    /**
     * Check whether binDir is in the runtime PATH and/or the shell config file.
     */
    check(env = process.env) {
        return {
            inPath: this.isInRuntimePath(env),
            inConfig: this.shellProvider.isInConfig(this.binDir),
            shellInfo: this.shellProvider.getShellInfo(),
            provider: this.shellProvider,
        };
    }
    /**
     * True if binDir is in the current process PATH (runtime check).
     * Normalises all entries to handle $HOME / ~ / absolute equivalences.
     */
    isInRuntimePath(env = process.env) {
        const pathEnv = env.PATH ?? env.Path ?? "";
        const sep = this.shellProvider.getShellInfo().pathSeparator;
        const normalBin = path.resolve(this.binDir);
        return pathEnv.split(sep).some(e => path.resolve(e) === normalBin);
    }
    // ── Modification ───────────────────────────────────────────────────────
    /**
     * Add binDir to the shell config.
     * In interactive mode (TTY), prompts the user for permission.
     * Returns a result describing what happened.
     */
    async addToPath(opts = {}) {
        const { dryRun = false, interactive = true, force = false } = opts;
        // Already configured
        if (this.shellProvider.isInConfig(this.binDir)) {
            const restartNeeded = !this.isInRuntimePath();
            return {
                updated: false,
                alreadyInPath: true,
                denied: false,
                shellRestart: restartNeeded,
                instruction: restartNeeded ? this.restartInstruction() : "",
            };
        }
        // Interactive prompt if TTY
        if (interactive && !force && process.stdin.isTTY) {
            const granted = await this.promptUser();
            if (!granted) {
                return {
                    updated: false,
                    alreadyInPath: false,
                    denied: true,
                    shellRestart: false,
                    instruction: this.manualInstruction(),
                };
            }
        }
        const wrote = this.shellProvider.addToPath(this.binDir, dryRun);
        return {
            updated: wrote,
            alreadyInPath: !wrote,
            denied: false,
            shellRestart: wrote && !this.isInRuntimePath(),
            instruction: wrote ? this.restartInstruction() : "",
        };
    }
    /**
     * Remove binDir from the shell config.
     */
    removeFromPath(dryRun = false) {
        return this.shellProvider.removeFromPath(this.binDir, dryRun);
    }
    // ── Shell Restart Detection ────────────────────────────────────────────
    /**
     * Check whether the current shell has the new PATH.
     * If not, returns shell-specific instructions.
     */
    detectRestart() {
        if (this.isInRuntimePath()) {
            return { needed: false, instruction: "" };
        }
        return { needed: true, instruction: this.restartInstruction() };
    }
    // ── Private ────────────────────────────────────────────────────────────
    restartInstruction() {
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
    manualInstruction() {
        const info = this.shellProvider.getShellInfo();
        if (info.shell === "cmd") {
            return `Add %USERPROFILE%\\.project-brain\\bin to your system PATH manually.`;
        }
        return `Add the following to ${info.configFile}:\n  export PATH="$HOME/.project-brain/bin:$PATH"`;
    }
    async promptUser() {
        const info = this.shellProvider.getShellInfo();
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stderr,
        });
        return new Promise((resolve) => {
            rl.question(`\nProject Brain needs to add:\n` +
                `  ~/.project-brain/bin\n` +
                `to your PATH so provider wrappers work correctly.\n` +
                `Modify ${info.configFile} automatically? [Y/n] `, (answer) => {
                rl.close();
                const a = answer.trim().toLowerCase();
                resolve(a === "" || a === "y" || a === "yes");
            });
        });
    }
}
