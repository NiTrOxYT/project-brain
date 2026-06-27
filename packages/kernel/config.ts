// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — Kernel — Configuration Service
// Hierarchy priority: CLI > ENV > Workspace > Global > Defaults.
// ──────────────────────────────────────────────────────────────────────────────

export class ConfigurationService {
    private readonly store = new Map<string, unknown>();

    get<T>(key: string, defaultValue?: T): T {
        // 1. Env variables priority (prefixed with BRAIN_)
        const envKey = `BRAIN_${key.toUpperCase().replace(/\./g, "_")}`;
        const envVal = process.env[envKey];
        if (envVal !== undefined) {
            if (typeof defaultValue === "number") return Number(envVal) as any;
            if (typeof defaultValue === "boolean") return (envVal === "true") as any;
            return envVal as any;
        }

        // 2. Fall back to local store
        return (this.store.get(key) as T) ?? (defaultValue as T);
    }

    set(key: string, value: unknown): void {
        this.store.set(key, value);
    }

    has(key: string): boolean {
        return this.store.has(key);
    }
}
