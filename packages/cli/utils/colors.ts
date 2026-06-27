// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — Colors Utility
// ANSI color helpers with --no-color support
// ──────────────────────────────────────────────────────────────────────────────

let colorEnabled = true;

export function setColorEnabled(enabled: boolean): void {
    colorEnabled = enabled;
}

export function isColorEnabled(): boolean {
    return colorEnabled && process.env.NO_COLOR === undefined && process.env.TERM !== "dumb";
}

const esc = (code: number) => (s: string) =>
    isColorEnabled() ? `\x1b[${code}m${s}\x1b[0m` : s;

export const bold    = esc(1);
export const dim     = esc(2);
export const red     = esc(31);
export const green   = esc(32);
export const yellow  = esc(33);
export const blue    = esc(34);
export const magenta = esc(35);
export const cyan    = esc(36);
export const white   = esc(37);
export const gray    = esc(90);

export const success = (s: string) => green(`✔ ${s}`);
export const failure = (s: string) => red(`✖ ${s}`);
export const warn    = (s: string) => yellow(`⚠ ${s}`);
export const info    = (s: string) => cyan(`ℹ ${s}`);
export const pass    = (s: string) => green(`PASS  ${s}`);
export const fail    = (s: string) => red(`FAIL  ${s}`);
export const warnTag = (s: string) => yellow(`WARN  ${s}`);
