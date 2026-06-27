// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061D — Installer — Package Entrypoint
// ──────────────────────────────────────────────────────────────────────────────
export { BrainInstaller, INSTALLER_VERSION, EXIT_SUCCESS, EXIT_FATAL, EXIT_SHELL_CONFIG_DENIED, EXIT_PROVIDER_DISCOVERY, EXIT_WRAPPER_VALIDATION, } from "./installer.js";
export { ManifestManager, checksumContent, } from "./manifest.js";
export { PathManager, } from "./path-manager.js";
export { detectPlatform, detectShellProvider, ALL_SHELL_PROVIDERS, ZshShellProvider, BashShellProvider, FishShellProvider, PowerShellShellProvider, CmdShellProvider, NushellShellProvider, } from "./shell-provider.js";
