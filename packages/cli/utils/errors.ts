// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — Error Handling Utility
// ──────────────────────────────────────────────────────────────────────────────

import { red, bold, gray } from "./colors.js";
import { isVerbose, logger } from "./logger.js";
import { printJson } from "./json.js";

export const EXIT_SUCCESS    = 0;
export const EXIT_USER_INPUT = 1;
export const EXIT_VALIDATION = 2;
export const EXIT_WORKSPACE  = 3;
export const EXIT_RUNTIME    = 4;
export const EXIT_INTERNAL   = 5;

export class CliError extends Error {
    constructor(message: string, public readonly exitCode: number = EXIT_INTERNAL) {
        super(message);
        this.name = "CliError";
    }
}

export class UserInputError extends CliError {
    constructor(message: string) { super(message, EXIT_USER_INPUT); }
}

export class ValidationError extends CliError {
    constructor(message: string) { super(message, EXIT_VALIDATION); }
}

export class WorkspaceError extends CliError {
    constructor(message: string) { super(message, EXIT_WORKSPACE); }
}

export class RuntimeError extends CliError {
    constructor(message: string) { super(message, EXIT_RUNTIME); }
}

export function handleError(err: unknown, json: boolean): never {
    const isCliError = err instanceof CliError;
    const msg = err instanceof Error ? err.message : String(err);
    const code = isCliError ? err.exitCode : EXIT_INTERNAL;

    if (json) {
        printJson({ ok: false, error: msg, exitCode: code });
    } else {
        logger.error(red(bold("Error: ")) + msg);
        if (isVerbose() && err instanceof Error && err.stack) {
            logger.debug(gray(err.stack));
        }
    }
    process.exit(code);
}
