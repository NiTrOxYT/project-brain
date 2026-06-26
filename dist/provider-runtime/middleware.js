// ──────────────────────────────────────────────────────────────────────────────
// BUILD-049 — Provider Runtime — Middleware
// Lifecycle hooks for provider execution.
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Middleware chain executor.
 * Runs middlewares in registration order.
 * Validates task identity invariants after each middleware.
 */
export class MiddlewareChain {
    middlewares = [];
    add(middleware) {
        this.middlewares.push(middleware);
    }
    async runBeforeExecute(request, provider, negotiation) {
        const originalId = request.task.id;
        const originalType = request.task.type;
        for (const m of this.middlewares) {
            if (m.beforeExecute) {
                await m.beforeExecute(request, provider, negotiation);
                // Validate identity invariants
                if (request.task.id !== originalId || request.task.type !== originalType) {
                    throw new Error(`Middleware '${m.name ?? "unknown"}' mutated task identity during beforeExecute`);
                }
            }
        }
    }
    async runAfterExecute(request, response, metrics, provider) {
        for (const m of this.middlewares) {
            if (m.afterExecute) {
                try {
                    await m.afterExecute(request, response, metrics, provider);
                }
                catch { }
            }
        }
    }
    async runOnRetry(request, attempt, error, provider) {
        for (const m of this.middlewares) {
            if (m.onRetry) {
                try {
                    await m.onRetry(request, attempt, error, provider);
                }
                catch { }
            }
        }
    }
    async runOnFallback(request, fromProvider, toProvider, reason) {
        for (const m of this.middlewares) {
            if (m.onFallback) {
                try {
                    await m.onFallback(request, fromProvider, toProvider, reason);
                }
                catch { }
            }
        }
    }
    get length() {
        return this.middlewares.length;
    }
}
