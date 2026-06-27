// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061D — Installer — Shell Provider Interface & Implementations
// Abstracts shell-specific PATH management so adding a new shell never
// requires touching the installer engine.
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import os from "os";
import path from "path";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ShellPlatform = "macos" | "linux" | "windows";
export type ShellKind     = "zsh" | "bash" | "fish" | "powershell" | "cmd" | "nushell";

export interface ShellInfo {
    platform:      ShellPlatform;
    shell:         ShellKind;
    configFile:    string;
    pathSeparator: ":" | ";";
}

/**
 * Interface for shell-specific PATH management.
 * Implement this for each supported shell — the installer engine only
 * interacts through this contract.
 */
export interface ShellProvider {
    readonly shell: ShellKind;

    /** Return true if the current environment is running this shell. */
    detect(env?: NodeJS.ProcessEnv): boolean;

    /** Build the ShellInfo descriptor. */
    getShellInfo(): ShellInfo;

    /**
     * Return true if `binDir` (in any equivalent form — $HOME, ~, absolute)
     * already appears in the shell config file.
     */
    isInConfig(binDir: string): boolean;

    /**
     * Append the PATH entry to the shell's config file.
     * Returns true if a write was made, false if already present.
     * When dryRun is true, no file modification occurs.
     */
    addToPath(binDir: string, dryRun?: boolean): boolean;

    /**
     * Remove the PATH entry from the shell's config file.
     * Returns true if a removal was made.
     */
    removeFromPath(binDir: string, dryRun?: boolean): boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function detectPlatform(): ShellPlatform {
    switch (process.platform) {
        case "darwin": return "macos";
        case "win32":  return "windows";
        default:       return "linux";
    }
}

const HOME = os.homedir();

/** Marker comment so we can find our own entries. */
const MARKER = "# Added by Project Brain";

/**
 * Normalise a PATH entry for comparison.
 * Expands $HOME, ~, and resolves to an absolute path.
 */
function normalizePosixPathEntry(entry: string): string {
    let e = entry.trim();
    e = e.replace(/^\$HOME/, HOME);
    e = e.replace(/^~/, HOME);
    return path.resolve(e);
}

/**
 * Check whether any line in `content` already adds `binDir` to PATH,
 * regardless of whether it uses $HOME, ~, or the absolute path.
 */
function hasPosixPathEntry(content: string, binDir: string): boolean {
    const normalBin = path.resolve(binDir);
    const lines = content.split("\n");
    for (const line of lines) {
        // Match export PATH="<something>:$PATH" or similar patterns
        const match = line.match(/export\s+PATH\s*=\s*["']?([^"':]+)/);
        if (match) {
            if (normalizePosixPathEntry(match[1]) === normalBin) return true;
        }
        // Also match fish_add_path
        const fishMatch = line.match(/fish_add_path\s+(.+)/);
        if (fishMatch) {
            if (normalizePosixPathEntry(fishMatch[1].trim()) === normalBin) return true;
        }
    }
    return false;
}

// ─── POSIX Shell Implementations ─────────────────────────────────────────────

/** Shared logic for bash/zsh which both use `export PATH=...` in rc files. */
abstract class PosixExportShellProvider implements ShellProvider {
    abstract readonly shell: ShellKind;
    abstract readonly configFileName: string;

    detect(env: NodeJS.ProcessEnv = process.env): boolean {
        const shell = env.SHELL ?? "";
        return path.basename(shell) === this.shell;
    }

    getShellInfo(): ShellInfo {
        return {
            platform:      detectPlatform(),
            shell:         this.shell,
            configFile:    path.join(HOME, this.configFileName),
            pathSeparator: ":",
        };
    }

    isInConfig(binDir: string): boolean {
        const configFile = path.join(HOME, this.configFileName);
        if (!fs.existsSync(configFile)) return false;
        return hasPosixPathEntry(fs.readFileSync(configFile, "utf8"), binDir);
    }

    addToPath(binDir: string, dryRun = false): boolean {
        if (this.isInConfig(binDir)) return false;
        if (dryRun) return true;
        const configFile = path.join(HOME, this.configFileName);
        const line = `\nexport PATH="$HOME/.project-brain/bin:$PATH" ${MARKER}\n`;
        fs.appendFileSync(configFile, line, "utf8");
        return true;
    }

    removeFromPath(binDir: string, dryRun = false): boolean {
        const configFile = path.join(HOME, this.configFileName);
        if (!fs.existsSync(configFile)) return false;
        const content = fs.readFileSync(configFile, "utf8");
        const lines = content.split("\n");
        const filtered = lines.filter(l => {
            if (!l.includes(".project-brain/bin")) return true;
            // Only remove lines that have our marker or exact pattern
            if (l.includes(MARKER)) return false;
            const match = l.match(/export\s+PATH\s*=\s*["']?([^"':]+)/);
            if (match && normalizePosixPathEntry(match[1]) === path.resolve(binDir)) return false;
            return true;
        });
        if (filtered.length === lines.length) return false;
        if (!dryRun) {
            fs.writeFileSync(configFile, filtered.join("\n"), "utf8");
        }
        return true;
    }
}

export class ZshShellProvider extends PosixExportShellProvider {
    readonly shell: ShellKind = "zsh";
    readonly configFileName   = ".zshrc";
}

export class BashShellProvider extends PosixExportShellProvider {
    readonly shell: ShellKind = "bash";
    readonly configFileName   = ".bashrc";
}

// ─── Fish ────────────────────────────────────────────────────────────────────

export class FishShellProvider implements ShellProvider {
    readonly shell: ShellKind = "fish";

    detect(env: NodeJS.ProcessEnv = process.env): boolean {
        const s = env.SHELL ?? "";
        return path.basename(s) === "fish";
    }

    getShellInfo(): ShellInfo {
        return {
            platform:      detectPlatform(),
            shell:         "fish",
            configFile:    path.join(HOME, ".config", "fish", "config.fish"),
            pathSeparator: ":",
        };
    }

    isInConfig(binDir: string): boolean {
        const configFile = this.getShellInfo().configFile;
        if (!fs.existsSync(configFile)) return false;
        return hasPosixPathEntry(fs.readFileSync(configFile, "utf8"), binDir);
    }

    addToPath(binDir: string, dryRun = false): boolean {
        if (this.isInConfig(binDir)) return false;
        if (dryRun) return true;
        const configFile = this.getShellInfo().configFile;
        fs.mkdirSync(path.dirname(configFile), { recursive: true });
        const line = `\nfish_add_path $HOME/.project-brain/bin ${MARKER}\n`;
        fs.appendFileSync(configFile, line, "utf8");
        return true;
    }

    removeFromPath(binDir: string, dryRun = false): boolean {
        const configFile = this.getShellInfo().configFile;
        if (!fs.existsSync(configFile)) return false;
        const content = fs.readFileSync(configFile, "utf8");
        const lines = content.split("\n");
        const filtered = lines.filter(l => !l.includes(".project-brain/bin"));
        if (filtered.length === lines.length) return false;
        if (!dryRun) fs.writeFileSync(configFile, filtered.join("\n"), "utf8");
        return true;
    }
}

// ─── PowerShell ──────────────────────────────────────────────────────────────

export class PowerShellShellProvider implements ShellProvider {
    readonly shell: ShellKind = "powershell";

    detect(env: NodeJS.ProcessEnv = process.env): boolean {
        return !!env.PSModulePath;
    }

    getShellInfo(): ShellInfo {
        const platform = detectPlatform();
        let profilePath: string;
        if (platform === "windows") {
            profilePath = path.join(
                HOME, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1"
            );
        } else {
            profilePath = path.join(
                HOME, ".config", "powershell", "Microsoft.PowerShell_profile.ps1"
            );
        }
        return {
            platform,
            shell:         "powershell",
            configFile:    profilePath,
            pathSeparator: platform === "windows" ? ";" : ":",
        };
    }

    isInConfig(binDir: string): boolean {
        const configFile = this.getShellInfo().configFile;
        if (!fs.existsSync(configFile)) return false;
        const content = fs.readFileSync(configFile, "utf8");
        return content.includes(".project-brain") && content.includes("$env:PATH");
    }

    addToPath(binDir: string, dryRun = false): boolean {
        if (this.isInConfig(binDir)) return false;
        if (dryRun) return true;
        const configFile = this.getShellInfo().configFile;
        fs.mkdirSync(path.dirname(configFile), { recursive: true });
        const sep = this.getShellInfo().pathSeparator;
        const line = `\n$env:PATH = "$HOME/.project-brain/bin${sep}" + $env:PATH ${MARKER}\n`;
        fs.appendFileSync(configFile, line, "utf8");
        return true;
    }

    removeFromPath(binDir: string, dryRun = false): boolean {
        const configFile = this.getShellInfo().configFile;
        if (!fs.existsSync(configFile)) return false;
        const content = fs.readFileSync(configFile, "utf8");
        const lines = content.split("\n");
        const filtered = lines.filter(l => !l.includes(".project-brain"));
        if (filtered.length === lines.length) return false;
        if (!dryRun) fs.writeFileSync(configFile, filtered.join("\n"), "utf8");
        return true;
    }
}

// ─── CMD ─────────────────────────────────────────────────────────────────────

export class CmdShellProvider implements ShellProvider {
    readonly shell: ShellKind = "cmd";

    detect(env: NodeJS.ProcessEnv = process.env): boolean {
        if (detectPlatform() !== "windows") return false;
        return !env.PSModulePath; // Windows without PowerShell module path → CMD
    }

    getShellInfo(): ShellInfo {
        return {
            platform:      "windows",
            shell:         "cmd",
            configFile:    "", // CMD uses registry, not a config file
            pathSeparator: ";",
        };
    }

    isInConfig(_binDir: string): boolean {
        // For CMD, we check if the PATH environment variable already contains the entry.
        const pathEnv = process.env.PATH ?? process.env.Path ?? "";
        const normalBin = path.resolve(_binDir);
        return pathEnv.split(";").some(e => path.resolve(e) === normalBin);
    }

    addToPath(_binDir: string, dryRun = false): boolean {
        // CMD PATH must be modified via setx or registry.
        // In CI/automation this is unsafe without elevated privileges,
        // so we return false and let the installer display manual instructions.
        return false;
    }

    removeFromPath(_binDir: string, _dryRun = false): boolean {
        return false;
    }
}

// ─── Nushell ─────────────────────────────────────────────────────────────────

export class NushellShellProvider implements ShellProvider {
    readonly shell: ShellKind = "nushell";

    detect(env: NodeJS.ProcessEnv = process.env): boolean {
        const s = env.SHELL ?? "";
        return path.basename(s) === "nu";
    }

    getShellInfo(): ShellInfo {
        const platform = detectPlatform();
        let configFile: string;
        if (platform === "windows") {
            configFile = path.join(process.env.APPDATA ?? HOME, "nushell", "config.nu");
        } else {
            configFile = path.join(HOME, ".config", "nushell", "env.nu");
        }
        return {
            platform,
            shell:         "nushell",
            configFile,
            pathSeparator: platform === "windows" ? ";" : ":",
        };
    }

    isInConfig(binDir: string): boolean {
        const configFile = this.getShellInfo().configFile;
        if (!fs.existsSync(configFile)) return false;
        return fs.readFileSync(configFile, "utf8").includes(".project-brain/bin");
    }

    addToPath(binDir: string, dryRun = false): boolean {
        if (this.isInConfig(binDir)) return false;
        if (dryRun) return true;
        const configFile = this.getShellInfo().configFile;
        fs.mkdirSync(path.dirname(configFile), { recursive: true });
        const line = `\n$env.PATH = ($env.PATH | prepend $"($env.HOME)/.project-brain/bin") ${MARKER}\n`;
        fs.appendFileSync(configFile, line, "utf8");
        return true;
    }

    removeFromPath(binDir: string, dryRun = false): boolean {
        const configFile = this.getShellInfo().configFile;
        if (!fs.existsSync(configFile)) return false;
        const content = fs.readFileSync(configFile, "utf8");
        const lines = content.split("\n");
        const filtered = lines.filter(l => !l.includes(".project-brain/bin"));
        if (filtered.length === lines.length) return false;
        if (!dryRun) fs.writeFileSync(configFile, filtered.join("\n"), "utf8");
        return true;
    }
}

// ─── Registry & Detection ────────────────────────────────────────────────────

/** All built-in shell providers, ordered by priority. */
const ALL_SHELL_PROVIDERS: ShellProvider[] = [
    new ZshShellProvider(),
    new BashShellProvider(),
    new FishShellProvider(),
    new PowerShellShellProvider(),
    new CmdShellProvider(),
    new NushellShellProvider(),
];

/**
 * Detect the active shell from environment.
 * Falls back to zsh on macOS, bash on Linux, cmd on Windows.
 */
export function detectShellProvider(
    env: NodeJS.ProcessEnv = process.env,
    providers: ShellProvider[] = ALL_SHELL_PROVIDERS
): ShellProvider {
    for (const sp of providers) {
        if (sp.detect(env)) return sp;
    }
    // Fallback
    const platform = detectPlatform();
    if (platform === "macos")   return providers.find(p => p.shell === "zsh") ?? providers[0];
    if (platform === "windows") return providers.find(p => p.shell === "cmd") ?? providers[0];
    return providers.find(p => p.shell === "bash") ?? providers[0];
}

export { ALL_SHELL_PROVIDERS };
