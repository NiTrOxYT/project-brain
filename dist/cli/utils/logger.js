// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — Logger Utility
// ──────────────────────────────────────────────────────────────────────────────
import { bold, gray, red, yellow } from "./colors.js";
let level = "normal";
let jsonMode = false;
let redirectToStderr = false;
export function setLogLevel(l) { level = l; }
export function setJsonMode(j) { jsonMode = j; }
export function setRedirectToStderr(r) { redirectToStderr = r; }
export function isJson() { return jsonMode; }
export function isVerbose() { return level === "verbose"; }
const writeLog = (...args) => {
    if (redirectToStderr) {
        console.error(...args);
    }
    else {
        console.log(...args);
    }
};
export const logger = {
    log(...args) { if (level !== "silent" && level !== "quiet")
        writeLog(...args); },
    info(...args) { if (level !== "silent" && level !== "quiet")
        writeLog(...args); },
    warn(...args) { if (level !== "silent")
        console.error(yellow(`[warn] `), ...args); },
    error(...args) { if (level !== "silent")
        console.error(red(`[error] `), ...args); },
    debug(...args) { if (level === "verbose")
        console.error(gray(`[debug] `), ...args); },
    verbose(...args) { if (level === "verbose")
        console.error(gray(`[verbose] `), ...args); },
    section(title) { if (level !== "silent" && level !== "quiet")
        writeLog(`\n${bold(title)}`); },
    blank() { if (level !== "silent" && level !== "quiet")
        writeLog(""); },
};
