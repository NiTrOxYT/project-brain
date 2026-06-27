// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — Kernel — Event Bus
// Ordered, typed publish/subscribe event bus.
// ──────────────────────────────────────────────────────────────────────────────
export class EventBus {
    subscriptions = [];
    nextId = 1;
    /**
     * Subscribe to a specific event kind or all events ("*").
     */
    on(kind, handler) {
        const id = this.nextId++;
        this.subscriptions.push({ id, kind, handler, once: false });
        return () => this.remove(id);
    }
    /**
     * Subscribe to a specific event kind and auto-unsubscribe after first fire.
     */
    once(kind, handler) {
        const id = this.nextId++;
        this.subscriptions.push({ id, kind, handler, once: true });
    }
    /**
     * Synchronously emit an event to all matching subscribers.
     */
    emit(event) {
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
     * Pipe all events from this bus to another bus.
     */
    pipe(target) {
        return this.on("*", event => target.emit(event));
    }
    subscriberCount(kind) {
        if (kind === undefined)
            return this.subscriptions.length;
        return this.subscriptions.filter(s => s.kind === kind).length;
    }
    clear() {
        this.subscriptions = [];
    }
    remove(id) {
        const idx = this.subscriptions.findIndex(s => s.id === id);
        if (idx !== -1)
            this.subscriptions.splice(idx, 1);
    }
}
