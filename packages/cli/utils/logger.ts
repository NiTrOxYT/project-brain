// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — Logger Utility
// ──────────────────────────────────────────────────────────────────────────────

import { bold, gray, red, yellow } from "./colors.js";

export type LogLevel = "silent" | "quiet" | "normal" | "verbose";

let level: LogLevel = "normal";
let jsonMode = false;

export function setLogLevel(l: LogLevel): void { level = l; }
export function setJsonMode(j: boolean): void  { jsonMode = j; }
export function isJson(): boolean               { return jsonMode; }
export function isVerbose(): boolean            { return level === "verbose"; }

export const logger = {
    log(...args: unknown[])  { if (level !== "silent" && level !== "quiet") console.log(...args); },
    info(...args: unknown[]) { if (level !== "silent" && level !== "quiet") console.log(...args); },
    warn(...args: unknown[]) { if (level !== "silent") console.error(yellow(`[warn] `), ...args); },
    error(...args: unknown[]){ if (level !== "silent") console.error(red(`[error] `), ...args); },
    debug(...args: unknown[]){ if (level === "verbose") console.error(gray(`[debug] `), ...args); },
    verbose(...args: unknown[]){ if (level === "verbose") console.error(gray(`[verbose] `), ...args); },
    section(title: string)   { if (level !== "silent" && level !== "quiet") console.log(`\n${bold(title)}`); },
    blank()                  { if (level !== "silent" && level !== "quiet") console.log(""); },
};
