// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — JSON Output Utility
// ──────────────────────────────────────────────────────────────────────────────

export function printJson(data: unknown): void {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

export function jsonResult(ok: boolean, data: unknown, error?: string): object {
    return ok
        ? { ok: true,  data }
        : { ok: false, error: error ?? "Unknown error", data };
}
