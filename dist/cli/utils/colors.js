// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — Colors Utility
// ANSI color helpers with --no-color support
// ──────────────────────────────────────────────────────────────────────────────
let colorEnabled = true;
export function setColorEnabled(enabled) {
    colorEnabled = enabled;
}
export function isColorEnabled() {
    return colorEnabled && process.env.NO_COLOR === undefined && process.env.TERM !== "dumb";
}
const esc = (code) => (s) => isColorEnabled() ? `\x1b[${code}m${s}\x1b[0m` : s;
export const bold = esc(1);
export const dim = esc(2);
export const red = esc(31);
export const green = esc(32);
export const yellow = esc(33);
export const blue = esc(34);
export const magenta = esc(35);
export const cyan = esc(36);
export const white = esc(37);
export const gray = esc(90);
export const success = (s) => green(`✔ ${s}`);
export const failure = (s) => red(`✖ ${s}`);
export const warn = (s) => yellow(`⚠ ${s}`);
export const info = (s) => cyan(`ℹ ${s}`);
export const pass = (s) => green(`PASS  ${s}`);
export const fail = (s) => red(`FAIL  ${s}`);
export const warnTag = (s) => yellow(`WARN  ${s}`);
