// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050A — Provider Execution Layer — Retry Policy
// Deterministic retry logic. Same error + policy = same decision.
// ──────────────────────────────────────────────────────────────────────────────

import { RetryPolicy } from "./types.js";
import { isTransientExitCode } from "./errors.js";

export interface RetryDecision {
    shouldRetry: boolean;
    delayMs: number;
    reason: string;
}

/**
 * Stateless retry policy evaluator.
 * Given an error and attempt number, returns a deterministic decision.
 */
export class RetryEvaluator {
    constructor(private readonly policy: RetryPolicy) { }

    /**
     * Evaluate whether the execution should be retried.
     *
     * @param attempt — 0-based current attempt index
     * @param exitCode — process exit code (null if killed by signal)
     * @param error — the error that caused the failure
     */
    evaluate(
        attempt: number,
        exitCode: number | null,
        error?: Error
    ): RetryDecision {
        // Exceeded max retries
        if (attempt >= this.policy.maxRetries) {
            return {
                shouldRetry: false,
                delayMs: 0,
                reason: `Max retries (${this.policy.maxRetries}) exceeded`
            };
        }

        // Error explicitly marked non-retryable
        if (error && "retryable" in error && (error as any).retryable === false) {
            return {
                shouldRetry: false,
                delayMs: 0,
                reason: `Non-retryable error: ${error.constructor.name}`
            };
        }

        // Permanent exit code
        if (exitCode !== null && !isTransientExitCode(exitCode, this.policy.permanentFailureCodes)) {
            return {
                shouldRetry: false,
                delayMs: 0,
                reason: `Permanent exit code: ${exitCode}`
            };
        }

        // Calculate deterministic delay
        const delay = this.computeDelay(attempt);

        return {
            shouldRetry: true,
            delayMs: delay,
            reason: `Transient failure on attempt ${attempt + 1}, retrying after ${delay}ms`
        };
    }

    /**
     * Deterministic delay calculation.
     * delay = min(baseDelay * backoffFactor^attempt, maxDelay)
     */
    computeDelay(attempt: number): number {
        const delay = this.policy.baseDelayMs * Math.pow(this.policy.backoffFactor, attempt);
        return Math.min(delay, this.policy.maxDelayMs);
    }
}

/** Default retry policy for interactive provider processes. */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
    maxRetries: 2,
    baseDelayMs: 100,
    backoffFactor: 2,
    maxDelayMs: 5000,
    permanentFailureCodes: [126, 127, 128]
};

/** No-retry policy. */
export const NO_RETRY_POLICY: RetryPolicy = {
    maxRetries: 0,
    baseDelayMs: 0,
    backoffFactor: 1,
    maxDelayMs: 0,
    permanentFailureCodes: []
};
