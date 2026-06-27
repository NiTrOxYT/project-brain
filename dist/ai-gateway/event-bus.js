// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Event Bus
// Ordered, typed pub/sub. No console output. No async reordering.
// ──────────────────────────────────────────────────────────────────────────────
export class GatewayEventBus {
    subscriptions = [];
    nextId = 1;
    // ── Subscribe ─────────────────────────────────────────────────────────────
    /**
     * Subscribe to a specific event kind or all events ("*").
     * Returns an unsubscribe function.
     */
    on(kind, handler) {
        const id = this.nextId++;
        this.subscriptions.push({ id, kind, handler, once: false });
        return () => this.remove(id);
    }
    /**
     * Subscribe to a specific event kind and automatically unsubscribe after
     * the first invocation.
     */
    once(kind, handler) {
        const id = this.nextId++;
        this.subscriptions.push({ id, kind, handler, once: true });
    }
    // ── Emit ──────────────────────────────────────────────────────────────────
    /**
     * Emit an event synchronously to all matching subscribers.
     * Delivery order is guaranteed: subscribers are called in registration order.
     * Once-subscribers are removed after firing.
     */
    emit(event) {
        // Snapshot current subscribers to avoid mutation-during-iteration issues.
        const snapshot = this.subscriptions.slice();
        const toRemove = [];
        for (const sub of snapshot) {
            if (sub.kind === "*" || sub.kind === event.kind) {
                sub.handler(event);
                if (sub.once) {
                    toRemove.push(sub.id);
                }
            }
        }
        for (const id of toRemove) {
            this.remove(id);
        }
    }
    /**
     * Forward all events from this bus to another bus.
     * Returns an unsubscribe function that stops forwarding.
     */
    pipe(target) {
        return this.on("*", event => target.emit(event));
    }
    // ── Introspection ─────────────────────────────────────────────────────────
    /** Number of active subscribers (useful for tests). */
    subscriberCount(kind) {
        if (kind === undefined)
            return this.subscriptions.length;
        return this.subscriptions.filter(s => s.kind === kind).length;
    }
    /** Remove all subscribers. */
    clear() {
        this.subscriptions = [];
    }
    // ── Private ───────────────────────────────────────────────────────────────
    remove(id) {
        const idx = this.subscriptions.findIndex(s => s.id === id);
        if (idx !== -1)
            this.subscriptions.splice(idx, 1);
    }
}
// ─── Factory helpers ──────────────────────────────────────────────────────────
/** Create a GatewayEvent with the current timestamp. */
export function makeEvent(kind, sessionId, payload = {}) {
    return {
        kind,
        sessionId,
        timestamp: new Date().toISOString(),
        payload,
    };
}
