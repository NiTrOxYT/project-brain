// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — doctor command
// brain doctor  →  Run diagnostics across ALL modules
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import "../../ai-gateway/adapters/index.js";
import { logger } from "../utils/logger.js";
import { printJson } from "../utils/json.js";
import { isBrainInitialized } from "../utils/paths.js";
import { pass, fail, warnTag, bold } from "../utils/colors.js";
import { StoragePaths } from "../../kernel/paths.js";
async function checkExists(name, filePath, warn = false) {
    const exists = fs.existsSync(filePath);
    if (exists)
        return { name, status: "PASS", detail: filePath };
    return { name, status: warn ? "WARN" : "FAIL", detail: `Missing: ${filePath}` };
}
export async function runDoctor(opts, subcommand) {
    if (subcommand === "providers") {
        await runDoctorProviders(opts);
        return;
    }
    const results = [];
    const ws = opts.workspace;
    const paths = new StoragePaths(ws);
    // ── Workspace ──────────────────────────────────────────────
    results.push({
        name: "Workspace initialized",
        status: isBrainInitialized(ws) ? "PASS" : "FAIL",
        detail: isBrainInitialized(ws) ? paths.brainDir : `Missing .brain dir in ${ws}`,
    });
    const subdirs = [
        { label: "snapshots", path: paths.snapshotsDir },
        { label: "patches", path: paths.patchesDir },
        { label: "cache", path: paths.compilerCacheDir },
        { label: "journal", path: paths.journalDir },
        { label: "checkpoints", path: paths.checkpointsDir },
        { label: "learning", path: paths.learningDir },
        { label: "shared-memory", path: paths.sharedMemoryDir }
    ];
    for (const sub of subdirs) {
        results.push(await checkExists(`Directory: .brain/${sub.label}`, sub.path, true));
    }
    // ── Snapshots ──────────────────────────────────────────────
    const snapshotDir = paths.snapshotsDir;
    const snapshots = fs.existsSync(snapshotDir)
        ? fs.readdirSync(snapshotDir).filter(f => f.endsWith(".json") && f !== "index.json")
        : [];
    results.push({
        name: "Snapshots exist",
        status: snapshots.length > 0 ? "PASS" : "WARN",
        detail: `${snapshots.length} snapshot(s) found`,
    });
    // ── Indexes ────────────────────────────────────────────────
    results.push(await checkExists("Index file", paths.indexPath, true));
    // ── Cache ──────────────────────────────────────────────────
    const cacheDir = paths.compilerCacheDir;
    const cacheFiles = fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir).length : 0;
    results.push({
        name: "Cache directory",
        status: fs.existsSync(cacheDir) ? "PASS" : "WARN",
        detail: `${cacheFiles} cached items`,
    });
    // ── Journal ────────────────────────────────────────────────
    const journalDir = paths.journalDir;
    const journalFiles = fs.existsSync(journalDir) ? fs.readdirSync(journalDir).length : 0;
    results.push({
        name: "Journal",
        status: "PASS",
        detail: `${journalFiles} journal file(s)`,
    });
    // ── Locks ──────────────────────────────────────────────────
    const locksDir = paths.locksDir;
    const lockFiles = fs.existsSync(locksDir) ? fs.readdirSync(locksDir).length : 0;
    results.push({
        name: "Active locks",
        status: lockFiles === 0 ? "PASS" : "WARN",
        detail: `${lockFiles} lock file(s)`,
    });
    // ── Storage ────────────────────────────────────────────────
    try {
        const s = fs.statfsSync?.(ws);
        if (s) {
            const freeBytes = s.bfree * s.bsize;
            const freeGb = (freeBytes / 1e9).toFixed(1);
            results.push({
                name: "Disk space",
                status: freeBytes > 500_000_000 ? "PASS" : "WARN",
                detail: `${freeGb} GB free`,
            });
        }
        else {
            results.push({ name: "Disk space", status: "WARN", detail: "Unable to determine" });
        }
    }
    catch {
        results.push({ name: "Disk space", status: "WARN", detail: "Unable to determine" });
    }
    // ── Provider availability ──────────────────────────────────
    try {
        const { ProviderRuntimeService } = await import("../../provider-runtime/service.js");
        const svc = new ProviderRuntimeService(opts.workspace);
        const diag = svc.diagnostics?.() ?? {};
        const count = diag.registeredProviderIds?.length ?? 0;
        results.push({
            name: "Providers registered",
            status: count > 0 ? "PASS" : "WARN",
            detail: `${count} provider(s)`,
        });
    }
    catch {
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
        }
        catch {
            results.push({ name: "Context integrity", status: "WARN", detail: "Could not read latest snapshot" });
        }
    }
    else {
        results.push({ name: "Context integrity", status: "WARN", detail: "No snapshots to validate" });
    }
    // ── Shared memory ──────────────────────────────────────────
    const smDir = paths.sharedMemoryDir;
    results.push({
        name: "Shared memory storage",
        status: fs.existsSync(smDir) ? "PASS" : "WARN",
        detail: fs.existsSync(smDir) ? smDir : "Directory missing",
    });
    // ── Installer checks (BUILD-061D) ─────────────────────────
    try {
        const { GlobalPaths } = await import("../../kernel/paths.js");
        const { PathManager } = await import("../../installer/path-manager.js");
        const { ManifestManager, INSTALLER_VERSION } = await import("../../installer/index.js");
        const { AdapterRegistry } = await import("../../ai-gateway/adapter-registry.js");
        await import("../../ai-gateway/adapters/index.js");
        const gp = new GlobalPaths();
        // Global directories
        const allDirsExist = gp.allDirs().every((d) => fs.existsSync(d));
        results.push({
            name: "Global directories",
            status: allDirsExist ? "PASS" : "WARN",
            detail: allDirsExist ? gp.root : "Some global dirs missing — run brain install",
        });
        // PATH configured
        const pm = new PathManager(gp.binDir);
        const pathCheck = pm.check();
        results.push({
            name: "PATH configured",
            status: pathCheck.inPath ? "PASS" : (pathCheck.inConfig ? "WARN" : "WARN"),
            detail: pathCheck.inPath
                ? `bin/ in PATH (${pathCheck.shellInfo.shell})`
                : pathCheck.inConfig
                    ? "Configured but shell restart needed"
                    : "Not configured — run brain install",
        });
        // Wrapper integrity
        const manifest = new ManifestManager(gp.wrappersDir);
        const providers = manifest.listProviders();
        for (const pid of providers) {
            const status = manifest.verifyWrapper(pid, INSTALLER_VERSION);
            results.push({
                name: `Wrapper: ${pid}`,
                status: status === "ok" ? "PASS" : "WARN",
                detail: status,
            });
        }
        // Installer version
        results.push({
            name: "Installer version",
            status: "PASS",
            detail: `v${INSTALLER_VERSION}`,
        });
        // Plugin registry
        const adapters = AdapterRegistry.list();
        results.push({
            name: "Provider plugins",
            status: adapters.length > 0 ? "PASS" : "WARN",
            detail: `${adapters.length} adapter(s) registered`,
        });
    }
    catch {
        results.push({ name: "Installer checks", status: "WARN", detail: "Could not load installer module" });
    }
    // ── Output ─────────────────────────────────────────────────
    const totals = results.reduce((acc, r) => { acc[r.status]++; return acc; }, { PASS: 0, WARN: 0, FAIL: 0 });
    if (opts.json) {
        printJson({ ok: totals.FAIL === 0, results, totals });
    }
    else {
        logger.log(`\n${bold("brain doctor")} — Diagnostics Report\n`);
        for (const r of results) {
            const tag = r.status === "PASS" ? pass(r.name) :
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
        }
        else if (totals.WARN > 0) {
            logger.log(`\x1b[33m⚠ ${totals.WARN} warning(s) — workspace may need attention.\x1b[0m`);
        }
        else {
            logger.log(`\x1b[32m✔ All checks passed.\x1b[0m`);
        }
    }
}
export async function runDoctorProviders(opts) {
    const { ProviderDiscoveryEngine } = await import("../../provider-bridge/discovery.js");
    const { ProviderVerificationEngine } = await import("../../provider-bridge/provider-verifier.js");
    const { ProviderSchemaRegistry } = await import("../../provider-bridge/schema-registry.js");
    const { ProviderConfigurator } = await import("../../provider-bridge/provider-configurator.js");
    const { green, red, yellow, cyan, bold } = await import("../utils/colors.js");
    const schemas = ProviderSchemaRegistry.list();
    if (opts.json) {
        const diagnostics = [];
        for (const s of schemas) {
            const disc = ProviderDiscoveryEngine.discover(s.providerId, opts.workspace);
            const res = await ProviderVerificationEngine.verify(s.providerId, opts.workspace);
            diagnostics.push({ providerId: s.providerId, discovery: disc, verification: res });
        }
        printJson({ ok: true, diagnostics });
        return;
    }
    logger.log("🧠 \x1b[1mProject Brain — Provider Diagnostics Report\x1b[0m\n");
    for (const s of schemas) {
        const disc = ProviderDiscoveryEngine.discover(s.providerId, opts.workspace);
        const res = await ProviderVerificationEngine.verify(s.providerId, opts.workspace);
        logger.log(`${bold(s.providerId.toUpperCase())}`);
        if (!disc) {
            logger.log(`    Status: ${red("Not Installed")}`);
            logger.log(`    Remediation: Install the provider tool on your system.\n`);
            continue;
        }
        const activeConfigRes = ProviderConfigurator.getActiveConfigPath(s.providerId, opts.workspace);
        const minVer = s.manifest.compatibility.minimumVersion || "none";
        const maxVer = s.manifest.compatibility.maximumTestedVersion || "none";
        // Find unsupported capabilities
        const unsupportedCaps = [];
        for (const [k, v] of Object.entries(s.manifest.capabilities)) {
            if (v === false) {
                unsupportedCaps.push(k.replace("supports", ""));
            }
        }
        logger.log(`    Version                  : ${disc.version}`);
        logger.log(`    Supported Version Range  : min: ${minVer}, max: ${maxVer}`);
        logger.log(`    Configuration Mode       : ${disc.activeConfiguration}`);
        logger.log(`    Configuration Source     : ${activeConfigRes.path}`);
        logger.log(`    Selected MCP Transport   : ${disc.supportedTransports.join(" or ") || "none"}`);
        logger.log(`    Verification Stages:`);
        logger.log(`        Installation         : ${res.stages.installation === "Passed" ? green("Passed") : red("Failed")}`);
        logger.log(`        Configuration        : ${res.stages.configuration === "Passed" ? green("Passed") : red("Failed")}`);
        logger.log(`        Connectivity         : ${res.stages.connectivity === "Passed" ? green("Passed") : res.stages.connectivity === "Skipped" ? cyan("Skipped") : red("Failed")}`);
        logger.log(`        Behavioral           : ${res.stages.behavioral === "Passed" ? green("Passed") : res.stages.behavioral === "Skipped" ? cyan("Skipped") : red("Failed")}`);
        logger.log(`    Unsupported Capabilities : ${unsupportedCaps.join(", ") || "none"}`);
        logger.log(`    Last Verification        : ${new Date().toISOString()}`);
        logger.log(`    Result                   : ${res.state === "Brain Optimized" || res.state === "Brain Enabled" ? green(res.state) : red(res.state)}`);
        if (res.errors.length > 0) {
            logger.log(`    Suggested Remediation:`);
            for (const err of res.errors) {
                logger.log(`      - ${yellow(err)}`);
                if (err.includes("installation")) {
                    logger.log(`        👉 Install/Update ${s.providerId} or ensure it is accessible in PATH.`);
                }
                else if (err.includes("registration") || err.includes("missing")) {
                    logger.log(`        👉 Run: ${cyan(`brain provider configure ${s.providerId}`)} to setup MCP configuration.`);
                }
                else if (err.includes("handshake") || err.includes("spawn")) {
                    logger.log(`        👉 Run: ${cyan(`brain provider repair ${s.providerId}`)} to repair wrapper scripts.`);
                }
            }
        }
        logger.log("");
    }
}
