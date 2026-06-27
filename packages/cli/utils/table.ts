// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — Table Utility
// ──────────────────────────────────────────────────────────────────────────────

import { bold, gray, isColorEnabled } from "./colors.js";

export interface TableColumn {
    header: string;
    key: string;
    width?: number;
    align?: "left" | "right";
}

export function renderTable(columns: TableColumn[], rows: Record<string, string>[]): string {
    // compute widths
    const widths = columns.map(c => {
        const dataWidth = rows.reduce((m, r) => Math.max(m, String(r[c.key] ?? "").length), 0);
        return c.width ?? Math.max(c.header.length, dataWidth);
    });

    const sep = "  ";
    const line = (parts: string[]) => parts.join(sep);

    const pad = (s: string, w: number, align: "left" | "right" = "left") =>
        align === "right" ? s.padStart(w) : s.padEnd(w);

    const header = line(columns.map((c, i) =>
        isColorEnabled() ? bold(pad(c.header, widths[i], c.align)) : pad(c.header, widths[i], c.align)
    ));

    const divider = line(widths.map(w => "─".repeat(w)));

    const body = rows.map(r =>
        line(columns.map((c, i) => pad(String(r[c.key] ?? ""), widths[i], c.align)))
    );

    return [header, divider, ...body].join("\n");
}

export function renderKeyValue(pairs: [string, string][], labelWidth = 20): string {
    return pairs
        .map(([k, v]) => `  ${isColorEnabled() ? bold(k.padEnd(labelWidth)) : k.padEnd(labelWidth)}  ${v}`)
        .join("\n");
}
