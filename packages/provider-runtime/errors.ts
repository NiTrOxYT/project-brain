// ──────────────────────────────────────────────────────────────────────────────
// BUILD-049 — Provider Runtime — Errors
// ──────────────────────────────────────────────────────────────────────────────

export class ProviderRuntimeError extends Error {
    readonly code: string = "PROVIDER_RUNTIME_ERROR";
    constructor(message: string) {
        super(message);
        this.name = "ProviderRuntimeError";
    }
}

export class ProviderNotFoundError extends ProviderRuntimeError {
    override readonly code: string = "PROVIDER_NOT_FOUND";
    constructor(public readonly providerId: string) {
        super(`Provider not found: '${providerId}'`);
        this.name = "ProviderNotFoundError";
    }
}

export class ProviderNegotiationError extends ProviderRuntimeError {
    override readonly code: string = "PROVIDER_NEGOTIATION_ERROR";
    constructor(
        public readonly capability: string,
        message: string
    ) {
        super(`Negotiation failed for capability '${capability}': ${message}`);
        this.name = "ProviderNegotiationError";
    }
}

export class ProviderHealthError extends ProviderRuntimeError {
    override readonly code: string = "PROVIDER_HEALTH_ERROR";
    constructor(
        public readonly providerId: string,
        message: string
    ) {
        super(`Health check failed for provider '${providerId}': ${message}`);
        this.name = "ProviderHealthError";
    }
}

export class ProviderMetricsError extends ProviderRuntimeError {
    override readonly code: string = "PROVIDER_METRICS_ERROR";
    constructor(message: string) {
        super(`Metrics error: ${message}`);
        this.name = "ProviderMetricsError";
    }
}

export class ProviderSessionError extends ProviderRuntimeError {
    override readonly code: string = "PROVIDER_SESSION_ERROR";
    constructor(
        public readonly sessionId: string,
        message: string
    ) {
        super(`Session error [${sessionId}]: ${message}`);
        this.name = "ProviderSessionError";
    }
}

export class ProviderStreamError extends ProviderRuntimeError {
    override readonly code: string = "PROVIDER_STREAM_ERROR";
    constructor(message: string) {
        super(`Stream error: ${message}`);
        this.name = "ProviderStreamError";
    }
}

/**
 * Transient errors may be retried (max 2 attempts).
 * After exhausting retries, falls back to next provider.
 */
export class TransientProviderError extends ProviderRuntimeError {
    override readonly code: string = "PROVIDER_TRANSIENT_ERROR";
    readonly retryable = true;
    constructor(
        public readonly providerId: string,
        message: string
    ) {
        super(`Transient error on provider '${providerId}': ${message}`);
        this.name = "TransientProviderError";
    }
}

/**
 * Permanent errors immediately trigger provider fallback.
 * No retry attempted.
 */
export class PermanentProviderError extends ProviderRuntimeError {
    override readonly code: string = "PROVIDER_PERMANENT_ERROR";
    readonly retryable = false;
    constructor(
        public readonly providerId: string,
        message: string
    ) {
        super(`Permanent error on provider '${providerId}': ${message}`);
        this.name = "PermanentProviderError";
    }
}
