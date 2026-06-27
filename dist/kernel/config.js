// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — Kernel — Configuration Service
// Hierarchy priority: CLI > ENV > Workspace > Global > Defaults.
// ──────────────────────────────────────────────────────────────────────────────
export class ConfigurationService {
    store = new Map();
    get(key, defaultValue) {
        // 1. Env variables priority (prefixed with BRAIN_)
        const envKey = `BRAIN_${key.toUpperCase().replace(/\./g, "_")}`;
        const envVal = process.env[envKey];
        if (envVal !== undefined) {
            if (typeof defaultValue === "number")
                return Number(envVal);
            if (typeof defaultValue === "boolean")
                return (envVal === "true");
            return envVal;
        }
        // 2. Fall back to local store
        return this.store.get(key) ?? defaultValue;
    }
    set(key, value) {
        this.store.set(key, value);
    }
    has(key) {
        return this.store.has(key);
    }
}
