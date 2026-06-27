// ──────────────────────────────────────────────────────────────────────────────
// BUILD-049 — Provider Runtime — Stream Emitter
// Unified streaming interface. Provider-independent.
// ──────────────────────────────────────────────────────────────────────────────

import { StreamEvent, StreamEventType } from "./types.js";
import { ProviderStreamError } from "./errors.js";

type StreamHandler = (event: StreamEvent) => void;

export class StreamEmitter {
    private readonly handlers = new Map<StreamEventType, StreamHandler[]>();
    private readonly anyHandlers: StreamHandler[] = [];
    private _eventCount = 0;

    /**
     * Register a handler for a specific event type.
     */
    on(type: StreamEventType, handler: StreamHandler): void {
        if (!this.handlers.has(type)) {
            this.handlers.set(type, []);
        }
        this.handlers.get(type)!.push(handler);
    }

    /**
     * Remove a handler for a specific event type.
     */
    off(type: StreamEventType, handler: StreamHandler): void {
        const list = this.handlers.get(type);
        if (list) {
            const idx = list.indexOf(handler);
            if (idx >= 0) list.splice(idx, 1);
        }
    }

    /**
     * Register a catch-all handler that receives every event.
     */
    onAny(handler: StreamHandler): void {
        this.anyHandlers.push(handler);
    }

    /**
     * Emit an event to all registered handlers.
     * Errors in handlers are suppressed to not break execution flow.
     */
    emit(event: StreamEvent): void {
        this._eventCount++;

        // Type-specific handlers
        const typed = this.handlers.get(event.type);
        if (typed) {
            for (const h of typed) {
                try { h(event); } catch {}
            }
        }

        // Catch-all handlers
        for (const h of this.anyHandlers) {
            try { h(event); } catch {}
        }
    }

    /**
     * Remove all handlers.
     */
    removeAllListeners(): void {
        this.handlers.clear();
        this.anyHandlers.length = 0;
    }

    get eventCount(): number {
        return this._eventCount;
    }
}
