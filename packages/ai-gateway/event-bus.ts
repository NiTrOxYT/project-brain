// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Event Bus
// Ordered, typed pub/sub. No console output. No async reordering.
// ──────────────────────────────────────────────────────────────────────────────

import type {
    GatewayEvent,
    GatewayEventKind,
    EventHandler,
    Unsubscribe,
} from "./types.js";

type WildcardKind = "*";
type SubscriptionKind = GatewayEventKind | WildcardKind;

interface Subscription {
    id:      number;
    kind:    SubscriptionKind;
    handler: EventHandler;
    once:    boolean;
}

export class GatewayEventBus {
    private subscriptions: Subscription[] = [];
    private nextId = 1;

    // ── Subscribe ─────────────────────────────────────────────────────────────

    /**
     * Subscribe to a specific event kind or all events ("*").
     * Returns an unsubscribe function.
     */
    on(kind: SubscriptionKind, handler: EventHandler): Unsubscribe {
        const id = this.nextId++;
        this.subscriptions.push({ id, kind, handler, once: false });
        return () => this.remove(id);
    }

    /**
     * Subscribe to a specific event kind and automatically unsubscribe after
     * the first invocation.
     */
    once(kind: GatewayEventKind, handler: EventHandler): void {
        const id = this.nextId++;
        this.subscriptions.push({ id, kind, handler, once: true });
    }

    // ── Emit ──────────────────────────────────────────────────────────────────

    /**
     * Emit an event synchronously to all matching subscribers.
     * Delivery order is guaranteed: subscribers are called in registration order.
     * Once-subscribers are removed after firing.
     */
    emit(event: GatewayEvent): void {
        // Snapshot current subscribers to avoid mutation-during-iteration issues.
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
     * Forward all events from this bus to another bus.
     * Returns an unsubscribe function that stops forwarding.
     */
    pipe(target: GatewayEventBus): Unsubscribe {
        return this.on("*", event => target.emit(event));
    }

    // ── Introspection ─────────────────────────────────────────────────────────

    /** Number of active subscribers (useful for tests). */
    subscriberCount(kind?: SubscriptionKind): number {
        if (kind === undefined) return this.subscriptions.length;
        return this.subscriptions.filter(s => s.kind === kind).length;
    }

    /** Remove all subscribers. */
    clear(): void {
        this.subscriptions = [];
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private remove(id: number): void {
        const idx = this.subscriptions.findIndex(s => s.id === id);
        if (idx !== -1) this.subscriptions.splice(idx, 1);
    }
}

// ─── Factory helpers ──────────────────────────────────────────────────────────

/** Create a GatewayEvent with the current timestamp. */
export function makeEvent(
    kind:      GatewayEventKind,
    sessionId: string,
    payload:   Record<string, unknown> = {}
): GatewayEvent {
    return {
        kind,
        sessionId,
        timestamp: new Date().toISOString(),
        payload,
    };
}
