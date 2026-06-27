// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — Kernel — Event Bus
// Ordered, typed publish/subscribe event bus.
// ──────────────────────────────────────────────────────────────────────────────

import type { GatewayEvent, SubscriptionKind, EventHandler, Unsubscribe } from "./events.js";

export class EventBus {
    private subscriptions: { id: number; kind: SubscriptionKind; handler: EventHandler; once: boolean }[] = [];
    private nextId = 1;

    /**
     * Subscribe to a specific event kind or all events ("*").
     */
    on(kind: SubscriptionKind, handler: EventHandler): Unsubscribe {
        const id = this.nextId++;
        this.subscriptions.push({ id, kind, handler, once: false });
        return () => this.remove(id);
    }

    /**
     * Subscribe to a specific event kind and auto-unsubscribe after first fire.
     */
    once(kind: any, handler: EventHandler): void {
        const id = this.nextId++;
        this.subscriptions.push({ id, kind, handler, once: true });
    }

    /**
     * Synchronously emit an event to all matching subscribers.
     */
    emit(event: GatewayEvent): void {
        const snapshot = this.subscriptions.slice();
        const toRemove: number[] = [];

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
    pipe(target: EventBus): Unsubscribe {
        return this.on("*", event => target.emit(event));
    }

    subscriberCount(kind?: SubscriptionKind): number {
        if (kind === undefined) return this.subscriptions.length;
        return this.subscriptions.filter(s => s.kind === kind).length;
    }

    clear(): void {
        this.subscriptions = [];
    }

    private remove(id: number): void {
        const idx = this.subscriptions.findIndex(s => s.id === id);
        if (idx !== -1) this.subscriptions.splice(idx, 1);
    }
}
