// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — Table Utility
// ──────────────────────────────────────────────────────────────────────────────
import { bold, isColorEnabled } from "./colors.js";
export function renderTable(columns, rows) {
    // compute widths
    const widths = columns.map(c => {
        const dataWidth = rows.reduce((m, r) => Math.max(m, String(r[c.key] ?? "").length), 0);
        return c.width ?? Math.max(c.header.length, dataWidth);
    });
    const sep = "  ";
    const line = (parts) => parts.join(sep);
    const pad = (s, w, align = "left") => align === "right" ? s.padStart(w) : s.padEnd(w);
    const header = line(columns.map((c, i) => isColorEnabled() ? bold(pad(c.header, widths[i], c.align)) : pad(c.header, widths[i], c.align)));
    const divider = line(widths.map(w => "─".repeat(w)));
    const body = rows.map(r => line(columns.map((c, i) => pad(String(r[c.key] ?? ""), widths[i], c.align))));
    return [header, divider, ...body].join("\n");
}
export function renderKeyValue(pairs, labelWidth = 20) {
    return pairs
        .map(([k, v]) => `  ${isColorEnabled() ? bold(k.padEnd(labelWidth)) : k.padEnd(labelWidth)}  ${v}`)
        .join("\n");
}
