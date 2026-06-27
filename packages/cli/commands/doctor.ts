// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — doctor command
// brain doctor  →  Run diagnostics across ALL modules
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { GlobalOptions } from "../main.js";
import { logger } from "../utils/logger.js";
import { printJson } from "../utils/json.js";
import { brainDir, isBrainInitialized } from "../utils/paths.js";
import { pass, fail, warnTag, bold } from "../utils/colors.js";

interface CheckResult {
    name:   string;
    status: "PASS" | "WARN" | "FAIL";
    detail: string;
}

async function checkExists(name: string, filePath: string, warn = false): Promise<CheckResult> {
    const exists = fs.existsSync(filePath);
    if (exists) return { name, status: "PASS", detail: filePath };
    return { name, status: warn ? "WARN" : "FAIL", detail: `Missing: ${filePath}` };
}

export async function runDoctor(opts: GlobalOptions): Promise<void> {
    const results: CheckResult[] = [];
    const ws = opts.workspace;
    const bd = brainDir(ws);

    // ── Workspace ──────────────────────────────────────────────
    results.push({
        name: "Workspace initialized",
        status: isBrainInitialized(ws) ? "PASS" : "FAIL",
        detail: isBrainInitialized(ws) ? bd : `Missing .brain dir in ${ws}`,
    });

    const subdirs = ["snapshots", "patches", "cache", "journal", "checkpoints", "learning", "shared-memory"];
    for (const sub of subdirs) {
        results.push(await checkExists(`Directory: .brain/${sub}`, path.join(bd, sub), true));
    }

    // ── Snapshots ──────────────────────────────────────────────
    const snapshotDir = path.join(bd, "snapshots");
    const snapshots = fs.existsSync(snapshotDir)
        ? fs.readdirSync(snapshotDir).filter(f => f.endsWith(".json"))
        : [];
    results.push({
        name: "Snapshots exist",
        status: snapshots.length > 0 ? "PASS" : "WARN",
        detail: `${snapshots.length} snapshot(s) found`,
    });

    // ── Indexes ────────────────────────────────────────────────
    results.push(await checkExists("Index file", path.join(bd, "snapshots", "index.json"), true));

    // ── Cache ──────────────────────────────────────────────────
    const cacheDir = path.join(bd, "cache");
    const cacheFiles = fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir).length : 0;
    results.push({
        name: "Cache directory",
        status: fs.existsSync(cacheDir) ? "PASS" : "WARN",
        detail: `${cacheFiles} cached items`,
    });

    // ── Journal ────────────────────────────────────────────────
    const journalDir = path.join(bd, "journal");
    const journalFiles = fs.existsSync(journalDir) ? fs.readdirSync(journalDir).length : 0;
    results.push({
        name: "Journal",
        status: "PASS",
        detail: `${journalFiles} journal file(s)`,
    });

    // ── Locks ──────────────────────────────────────────────────
    const locksDir = path.join(bd, "locks");
    const lockFiles = fs.existsSync(locksDir) ? fs.readdirSync(locksDir).length : 0;
    results.push({
        name: "Active locks",
        status: lockFiles === 0 ? "PASS" : "WARN",
        detail: `${lockFiles} lock file(s)`,
    });

    // ── Storage ────────────────────────────────────────────────
    try {
        const s = (fs as any).statfsSync?.(ws);
        if (s) {
            const freeBytes = s.bfree * s.bsize;
            const freeGb    = (freeBytes / 1e9).toFixed(1);
            results.push({
                name: "Disk space",
                status: freeBytes > 500_000_000 ? "PASS" : "WARN",
                detail: `${freeGb} GB free`,
            });
        } else {
            results.push({ name: "Disk space", status: "WARN", detail: "Unable to determine" });
        }
    } catch {
        results.push({ name: "Disk space", status: "WARN", detail: "Unable to determine" });
    }

    // ── Provider availability ──────────────────────────────────
    try {
        const { ProviderRuntimeService } = await import("../../provider-runtime/service.js");
        const svc = new ProviderRuntimeService(opts.workspace);
        const diag = svc.diagnostics?.() as any ?? {};
        const count = diag.registeredProviderIds?.length ?? 0;
        results.push({
            name: "Providers registered",
            status: count > 0 ? "PASS" : "WARN",
            detail: `${count} provider(s)`,
        });
    } catch {
        results.push({ name: "Providers registered", status: "WARN", detail: "Could not load provider registry" });
    }

    // ── Context integrity ──────────────────────────────────────
    if (snapshots.length > 0) {
        try {
            const latest = path.join(snapshotDir, snapshots[snapshots.length - 1]);
            const snap = JSON.parse(fs.readFileSync(latest, "utf-8"));
            const valid = snap && snap.snapshotId && Array.isArray(snap.files) && Array.isArray(snap.symbols);
            results.push({
                name: "Context integrity",
                status: valid ? "PASS" : "FAIL",
                detail: valid ? `Snapshot ${snap.snapshotId} looks valid` : "Snapshot structure invalid",
            });
        } catch {
            results.push({ name: "Context integrity", status: "WARN", detail: "Could not read latest snapshot" });
        }
    } else {
        results.push({ name: "Context integrity", status: "WARN", detail: "No snapshots to validate" });
    }

    // ── Shared memory ──────────────────────────────────────────
    const smDir = path.join(bd, "shared-memory");
    results.push({
        name: "Shared memory storage",
        status: fs.existsSync(smDir) ? "PASS" : "WARN",
        detail: fs.existsSync(smDir) ? smDir : "Directory missing",
    });

    // ── Output ─────────────────────────────────────────────────
    const totals = results.reduce(
        (acc, r) => { acc[r.status]++; return acc; },
        { PASS: 0, WARN: 0, FAIL: 0 } as Record<string, number>
    );

    if (opts.json) {
        printJson({ ok: totals.FAIL === 0, results, totals });
    } else {
        logger.log(`\n${bold("brain doctor")} — Diagnostics Report\n`);
        for (const r of results) {
            const tag = r.status === "PASS" ? pass(r.name)    :
                        r.status === "WARN" ? warnTag(r.name) :
                        fail(r.name);
            logger.log(`  ${tag}`);
            if (r.status !== "PASS" || opts.verbose) {
                logger.log(`         ${r.detail}`);
            }
        }
        logger.blank();
        logger.log(`  ${pass("PASS")} ${totals.PASS}   ${warnTag("WARN")} ${totals.WARN}   ${fail("FAIL")} ${totals.FAIL}`);
        logger.blank();
        if (totals.FAIL > 0) {
            logger.log(`\x1b[31m✖ ${totals.FAIL} check(s) failed.\x1b[0m`);
        } else if (totals.WARN > 0) {
            logger.log(`\x1b[33m⚠ ${totals.WARN} warning(s) — workspace may need attention.\x1b[0m`);
        } else {
            logger.log(`\x1b[32m✔ All checks passed.\x1b[0m`);
        }
    }
}
