// ──────────────────────────────────────────────────────────────────────────────
// BUILD-049 — Provider Runtime — Middleware
// Lifecycle hooks for provider execution.
// ──────────────────────────────────────────────────────────────────────────────

import { RuntimeRequest, RuntimeResponse } from "../agent-runtime/types";
import { ProviderMetrics, NegotiationResult } from "./types";
import { SDKProvider } from "./provider";

export interface ProviderMiddleware {
    /** Optional display name for diagnostics. */
    name?: string;

    /**
     * Called before execution begins.
     * May augment context but must NOT mutate task.id or task.type.
     */
    beforeExecute?(
        request: RuntimeRequest,
        provider: SDKProvider,
        negotiation: NegotiationResult
    ): Promise<void> | void;

    /**
     * Called after execution completes (success or failure).
     */
    afterExecute?(
        request: RuntimeRequest,
        response: RuntimeResponse,
        metrics: ProviderMetrics,
        provider: SDKProvider
    ): Promise<void> | void;

    /**
     * Called when a retry is about to happen.
     */
    onRetry?(
        request: RuntimeRequest,
        attempt: number,
        error: Error,
        provider: SDKProvider
    ): Promise<void> | void;

    /**
     * Called when provider fallback is triggered.
     */
    onFallback?(
        request: RuntimeRequest,
        fromProvider: SDKProvider,
        toProvider: SDKProvider,
        reason: string
    ): Promise<void> | void;
}

/**
 * Middleware chain executor.
 * Runs middlewares in registration order.
 * Validates task identity invariants after each middleware.
 */
export class MiddlewareChain {
    private readonly middlewares: ProviderMiddleware[] = [];

    add(middleware: ProviderMiddleware): void {
        this.middlewares.push(middleware);
    }

    async runBeforeExecute(
        request: RuntimeRequest,
        provider: SDKProvider,
        negotiation: NegotiationResult
    ): Promise<void> {
        const originalId = request.task.id;
        const originalType = request.task.type;

        for (const m of this.middlewares) {
            if (m.beforeExecute) {
                await m.beforeExecute(request, provider, negotiation);
                // Validate identity invariants
                if (request.task.id !== originalId || request.task.type !== originalType) {
                    throw new Error(
                        `Middleware '${m.name ?? "unknown"}' mutated task identity during beforeExecute`
                    );
                }
            }
        }
    }

    async runAfterExecute(
        request: RuntimeRequest,
        response: RuntimeResponse,
        metrics: ProviderMetrics,
        provider: SDKProvider
    ): Promise<void> {
        for (const m of this.middlewares) {
            if (m.afterExecute) {
                try {
                    await m.afterExecute(request, response, metrics, provider);
                } catch {}
            }
        }
    }

    async runOnRetry(
        request: RuntimeRequest,
        attempt: number,
        error: Error,
        provider: SDKProvider
    ): Promise<void> {
        for (const m of this.middlewares) {
            if (m.onRetry) {
                try {
                    await m.onRetry(request, attempt, error, provider);
                } catch {}
            }
        }
    }

    async runOnFallback(
        request: RuntimeRequest,
        fromProvider: SDKProvider,
        toProvider: SDKProvider,
        reason: string
    ): Promise<void> {
        for (const m of this.middlewares) {
            if (m.onFallback) {
                try {
                    await m.onFallback(request, fromProvider, toProvider, reason);
                } catch {}
            }
        }
    }

    get length(): number {
        return this.middlewares.length;
    }
}
