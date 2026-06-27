// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061D — Installer — Package Entrypoint
// ──────────────────────────────────────────────────────────────────────────────

export {
    BrainInstaller,
    INSTALLER_VERSION,
    EXIT_SUCCESS,
    EXIT_FATAL,
    EXIT_SHELL_CONFIG_DENIED,
    EXIT_PROVIDER_DISCOVERY,
    EXIT_WRAPPER_VALIDATION,
    type InstallerRunOptions,
    type InstallerResult,
    type ProviderDiscoveryResult,
    type WrapperGenerationResult,
    type RemovedProviderResult,
    type DiagnosticCheck,
} from "./installer.js";

export {
    ManifestManager,
    checksumContent,
    type WrapperRecord,
    type WrapperManifest,
} from "./manifest.js";

export {
    PathManager,
    type PathCheckResult,
    type PathUpdateResult,
} from "./path-manager.js";

export {
    type ShellInfo,
    type ShellKind,
    type ShellPlatform,
    type ShellProvider,
    detectPlatform,
    detectShellProvider,
    ALL_SHELL_PROVIDERS,
    ZshShellProvider,
    BashShellProvider,
    FishShellProvider,
    PowerShellShellProvider,
    CmdShellProvider,
    NushellShellProvider,
} from "./shell-provider.js";
