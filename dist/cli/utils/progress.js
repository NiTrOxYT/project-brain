// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — Progress Utility
// Simple progress bar for operations with known size
// ──────────────────────────────────────────────────────────────────────────────
import { isColorEnabled } from "./colors.js";
import { isJson } from "./logger.js";
export class ProgressBar {
    total;
    label;
    width;
    current = 0;
    constructor(total, label = "", width = 30) {
        this.total = total;
        this.label = label;
        this.width = width;
    }
    tick(amount = 1) {
        this.current = Math.min(this.current + amount, this.total);
        this.render();
    }
    done() {
        this.current = this.total;
        this.render();
        if (!isJson() && process.stderr.isTTY)
            process.stderr.write("\n");
    }
    render() {
        if (isJson() || !process.stderr.isTTY)
            return;
        const ratio = this.total > 0 ? this.current / this.total : 1;
        const filled = Math.round(this.width * ratio);
        const empty = this.width - filled;
        const bar = isColorEnabled()
            ? `\x1b[32m${"█".repeat(filled)}\x1b[90m${"░".repeat(empty)}\x1b[0m`
            : `${"#".repeat(filled)}${"-".repeat(empty)}`;
        const pct = String(Math.round(ratio * 100)).padStart(3);
        process.stderr.write(`\r${this.label} [${bar}] ${pct}%`);
    }
}
