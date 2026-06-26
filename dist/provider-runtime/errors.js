// ──────────────────────────────────────────────────────────────────────────────
// BUILD-049 — Provider Runtime — Errors
// ──────────────────────────────────────────────────────────────────────────────
export class ProviderRuntimeError extends Error {
    code = "PROVIDER_RUNTIME_ERROR";
    constructor(message) {
        super(message);
        this.name = "ProviderRuntimeError";
    }
}
export class ProviderNotFoundError extends ProviderRuntimeError {
    providerId;
    code = "PROVIDER_NOT_FOUND";
    constructor(providerId) {
        super(`Provider not found: '${providerId}'`);
        this.providerId = providerId;
        this.name = "ProviderNotFoundError";
    }
}
export class ProviderNegotiationError extends ProviderRuntimeError {
    capability;
    code = "PROVIDER_NEGOTIATION_ERROR";
    constructor(capability, message) {
        super(`Negotiation failed for capability '${capability}': ${message}`);
        this.capability = capability;
        this.name = "ProviderNegotiationError";
    }
}
export class ProviderHealthError extends ProviderRuntimeError {
    providerId;
    code = "PROVIDER_HEALTH_ERROR";
    constructor(providerId, message) {
        super(`Health check failed for provider '${providerId}': ${message}`);
        this.providerId = providerId;
        this.name = "ProviderHealthError";
    }
}
export class ProviderMetricsError extends ProviderRuntimeError {
    code = "PROVIDER_METRICS_ERROR";
    constructor(message) {
        super(`Metrics error: ${message}`);
        this.name = "ProviderMetricsError";
    }
}
export class ProviderSessionError extends ProviderRuntimeError {
    sessionId;
    code = "PROVIDER_SESSION_ERROR";
    constructor(sessionId, message) {
        super(`Session error [${sessionId}]: ${message}`);
        this.sessionId = sessionId;
        this.name = "ProviderSessionError";
    }
}
export class ProviderStreamError extends ProviderRuntimeError {
    code = "PROVIDER_STREAM_ERROR";
    constructor(message) {
        super(`Stream error: ${message}`);
        this.name = "ProviderStreamError";
    }
}
/**
 * Transient errors may be retried (max 2 attempts).
 * After exhausting retries, falls back to next provider.
 */
export class TransientProviderError extends ProviderRuntimeError {
    providerId;
    code = "PROVIDER_TRANSIENT_ERROR";
    retryable = true;
    constructor(providerId, message) {
        super(`Transient error on provider '${providerId}': ${message}`);
        this.providerId = providerId;
        this.name = "TransientProviderError";
    }
}
/**
 * Permanent errors immediately trigger provider fallback.
 * No retry attempted.
 */
export class PermanentProviderError extends ProviderRuntimeError {
    providerId;
    code = "PROVIDER_PERMANENT_ERROR";
    retryable = false;
    constructor(providerId, message) {
        super(`Permanent error on provider '${providerId}': ${message}`);
        this.providerId = providerId;
        this.name = "PermanentProviderError";
    }
}
