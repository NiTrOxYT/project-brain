// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — JSON Output Utility
// ──────────────────────────────────────────────────────────────────────────────
export function printJson(data) {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}
export function jsonResult(ok, data, error) {
    return ok
        ? { ok: true, data }
        : { ok: false, error: error ?? "Unknown error", data };
}
