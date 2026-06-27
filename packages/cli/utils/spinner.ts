// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — Spinner Utility
// ──────────────────────────────────────────────────────────────────────────────

import { isColorEnabled } from "./colors.js";
import { isJson } from "./logger.js";

const FRAMES = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];

export class Spinner {
    private timer: ReturnType<typeof setInterval> | null = null;
    private frame = 0;

    constructor(private message: string) {}

    start(): void {
        if (isJson() || !process.stderr.isTTY) return;
        if (!isColorEnabled()) {
            process.stderr.write(`${this.message}...\n`);
            return;
        }
        process.stderr.write("\x1b[?25l"); // hide cursor
        this.timer = setInterval(() => {
            process.stderr.write(`\r\x1b[36m${FRAMES[this.frame++ % FRAMES.length]}\x1b[0m ${this.message}`);
        }, 80);
    }

    stop(finalLine?: string): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        if (isJson() || !process.stderr.isTTY) return;
        process.stderr.write("\r\x1b[K");      // clear line
        process.stderr.write("\x1b[?25h");     // show cursor
        if (finalLine) process.stderr.write(finalLine + "\n");
    }

    succeed(msg: string): void {
        this.stop(`\x1b[32m✔\x1b[0m ${msg}`);
    }

    fail(msg: string): void {
        this.stop(`\x1b[31m✖\x1b[0m ${msg}`);
    }
}
