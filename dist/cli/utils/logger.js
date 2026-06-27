// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — Logger Utility
// ──────────────────────────────────────────────────────────────────────────────
import { bold, gray, red, yellow } from "./colors.js";
let level = "normal";
let jsonMode = false;
export function setLogLevel(l) { level = l; }
export function setJsonMode(j) { jsonMode = j; }
export function isJson() { return jsonMode; }
export function isVerbose() { return level === "verbose"; }
export const logger = {
    log(...args) { if (level !== "silent" && level !== "quiet")
        console.log(...args); },
    info(...args) { if (level !== "silent" && level !== "quiet")
        console.log(...args); },
    warn(...args) { if (level !== "silent")
        console.error(yellow(`[warn] `), ...args); },
    error(...args) { if (level !== "silent")
        console.error(red(`[error] `), ...args); },
    debug(...args) { if (level === "verbose")
        console.error(gray(`[debug] `), ...args); },
    verbose(...args) { if (level === "verbose")
        console.error(gray(`[verbose] `), ...args); },
    section(title) { if (level !== "silent" && level !== "quiet")
        console.log(`\n${bold(title)}`); },
    blank() { if (level !== "silent" && level !== "quiet")
        console.log(""); },
};
