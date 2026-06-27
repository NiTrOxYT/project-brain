// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — Progress Utility
// Simple progress bar for operations with known size
// ──────────────────────────────────────────────────────────────────────────────

import { isColorEnabled } from "./colors.js";
import { isJson } from "./logger.js";

export class ProgressBar {
    private current = 0;

    constructor(
        private readonly total: number,
        private readonly label = "",
        private readonly width = 30
    ) {}

    tick(amount = 1): void {
        this.current = Math.min(this.current + amount, this.total);
        this.render();
    }

    done(): void {
        this.current = this.total;
        this.render();
        if (!isJson() && process.stderr.isTTY) process.stderr.write("\n");
    }

    private render(): void {
        if (isJson() || !process.stderr.isTTY) return;
        const ratio = this.total > 0 ? this.current / this.total : 1;
        const filled = Math.round(this.width * ratio);
        const empty  = this.width - filled;
        const bar = isColorEnabled()
            ? `\x1b[32m${"█".repeat(filled)}\x1b[90m${"░".repeat(empty)}\x1b[0m`
            : `${"#".repeat(filled)}${"-".repeat(empty)}`;
        const pct = String(Math.round(ratio * 100)).padStart(3);
        process.stderr.write(`\r${this.label} [${bar}] ${pct}%`);
    }
}
