// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Errors
// ──────────────────────────────────────────────────────────────────────────────
export class GatewayError extends Error {
    code;
    constructor(message, code = "GATEWAY_ERROR") {
        super(message);
        this.code = code;
        this.name = "GatewayError";
    }
}
export class ProviderNotInstalledError extends GatewayError {
    constructor(providerId) {
        super(`Provider "${providerId}" is not installed or not registered. Run: brain install`, "PROVIDER_NOT_INSTALLED");
        this.name = "ProviderNotInstalledError";
    }
}
export class ProviderDetectionError extends GatewayError {
    constructor(providerId, cause) {
        super(`Failed to detect provider "${providerId}": ${cause}`, "PROVIDER_DETECTION_ERROR");
        this.name = "ProviderDetectionError";
    }
}
export class ProviderLaunchError extends GatewayError {
    constructor(providerId, cause) {
        super(`Failed to launch provider "${providerId}": ${cause}`, "PROVIDER_LAUNCH_ERROR");
        this.name = "ProviderLaunchError";
    }
}
export class InstallationError extends GatewayError {
    constructor(message) {
        super(message, "INSTALLATION_ERROR");
        this.name = "InstallationError";
    }
}
export class WrapperLoopError extends InstallationError {
    constructor(providerId, path) {
        super(`Loop detected for provider "${providerId}": resolved binary path "${path}" is inside the Project Brain bin directory. ` +
            `This would cause infinite recursion. Run \`brain install --repair\` to fix.`);
        this.name = "WrapperLoopError";
    }
}
export class SessionStoreError extends GatewayError {
    constructor(message) {
        super(message, "SESSION_STORE_ERROR");
        this.name = "SessionStoreError";
    }
}
export class MetricsStoreError extends GatewayError {
    constructor(message) {
        super(message, "METRICS_STORE_ERROR");
        this.name = "MetricsStoreError";
    }
}
export class GlobalConfigError extends GatewayError {
    constructor(message) {
        super(message, "GLOBAL_CONFIG_ERROR");
        this.name = "GlobalConfigError";
    }
}
