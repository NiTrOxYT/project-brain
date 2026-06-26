// ──────────────────────────────────────────────────────────────────────────────
// BUILD-049 — Provider Runtime — Stream Emitter
// Unified streaming interface. Provider-independent.
// ──────────────────────────────────────────────────────────────────────────────
export class StreamEmitter {
    handlers = new Map();
    anyHandlers = [];
    _eventCount = 0;
    /**
     * Register a handler for a specific event type.
     */
    on(type, handler) {
        if (!this.handlers.has(type)) {
            this.handlers.set(type, []);
        }
        this.handlers.get(type).push(handler);
    }
    /**
     * Remove a handler for a specific event type.
     */
    off(type, handler) {
        const list = this.handlers.get(type);
        if (list) {
            const idx = list.indexOf(handler);
            if (idx >= 0)
                list.splice(idx, 1);
        }
    }
    /**
     * Register a catch-all handler that receives every event.
     */
    onAny(handler) {
        this.anyHandlers.push(handler);
    }
    /**
     * Emit an event to all registered handlers.
     * Errors in handlers are suppressed to not break execution flow.
     */
    emit(event) {
        this._eventCount++;
        // Type-specific handlers
        const typed = this.handlers.get(event.type);
        if (typed) {
            for (const h of typed) {
                try {
                    h(event);
                }
                catch { }
            }
        }
        // Catch-all handlers
        for (const h of this.anyHandlers) {
            try {
                h(event);
            }
            catch { }
        }
    }
    /**
     * Remove all handlers.
     */
    removeAllListeners() {
        this.handlers.clear();
        this.anyHandlers.length = 0;
    }
    get eventCount() {
        return this._eventCount;
    }
}
