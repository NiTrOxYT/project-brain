// ──────────────────────────────────────────────────────────────────────────────
// BUILD-069 — Provider Strategy Registry
// ──────────────────────────────────────────────────────────────────────────────
export class ProviderStrategyRegistry {
    static strategies = new Map();
    static register(strategy) {
        if (!strategy || !strategy.mode) {
            throw new Error("Invalid integration strategy. Must declare a mode.");
        }
        if (this.strategies.has(strategy.mode)) {
            throw new Error(`Duplicate strategy registration: A strategy for mode "${strategy.mode}" is already registered.`);
        }
        this.strategies.set(strategy.mode, strategy);
    }
    static unregister(mode) {
        this.strategies.delete(mode);
    }
    static resolve(mode) {
        const strategy = this.strategies.get(mode);
        if (!strategy) {
            throw new Error(`Strategy Resolution Failed: No integration strategy is registered for mode "${mode}".`);
        }
        return strategy;
    }
    static availableStrategies() {
        return Array.from(this.strategies.keys());
    }
    static clear() {
        this.strategies.clear();
    }
}
