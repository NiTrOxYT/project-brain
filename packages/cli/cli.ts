#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — Entry Shim
// This file is the bin entry: "brain" → dist/cli.js
// ──────────────────────────────────────────────────────────────────────────────

import { main } from "./main.js";
import process from "process";

main(process.argv.slice(2)).catch(err => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(3);
});
