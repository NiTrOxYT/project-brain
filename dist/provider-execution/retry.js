// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050A — Provider Execution Layer — Retry Policy
// Deterministic retry logic. Same error + policy = same decision.
// ──────────────────────────────────────────────────────────────────────────────
import { isTransientExitCode } from "./errors.js";
/**
 * Stateless retry policy evaluator.
 * Given an error and attempt number, returns a deterministic decision.
 */
export class RetryEvaluator {
    policy;
    constructor(policy) {
        this.policy = policy;
    }
    /**
     * Evaluate whether the execution should be retried.
     *
     * @param attempt — 0-based current attempt index
     * @param exitCode — process exit code (null if killed by signal)
     * @param error — the error that caused the failure
     */
    evaluate(attempt, exitCode, error) {
        // Exceeded max retries
        if (attempt >= this.policy.maxRetries) {
            return {
                shouldRetry: false,
                delayMs: 0,
                reason: `Max retries (${this.policy.maxRetries}) exceeded`
            };
        }
        // Error explicitly marked non-retryable
        if (error && "retryable" in error && error.retryable === false) {
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
    computeDelay(attempt) {
        const delay = this.policy.baseDelayMs * Math.pow(this.policy.backoffFactor, attempt);
        return Math.min(delay, this.policy.maxDelayMs);
    }
}
/** Default retry policy for interactive provider processes. */
export const DEFAULT_RETRY_POLICY = {
    maxRetries: 2,
    baseDelayMs: 100,
    backoffFactor: 2,
    maxDelayMs: 5000,
    permanentFailureCodes: [126, 127, 128]
};
/** No-retry policy. */
export const NO_RETRY_POLICY = {
    maxRetries: 0,
    baseDelayMs: 0,
    backoffFactor: 1,
    maxDelayMs: 0,
    permanentFailureCodes: []
};
