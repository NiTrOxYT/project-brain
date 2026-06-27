// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — CLI — gateway command
// brain gateway <subcommand> [options]
// Routes exclusively via the SDK boundaries using KernelContext.
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import { GlobalOptions } from "../main.js";
import { logger } from "../utils/logger.js";
import { printJson } from "../utils/json.js";
import { success, warn, failure } from "../utils/colors.js";
import {
    createKernelContext,
    runGatewaySession,
    getGatewayMetrics,
    queryGatewayHistory,
    findSessionById,
} from "../../sdk/index.js";
import {
    LiveConsole,
    GatewayEventBus,
    AdapterRegistry,
    GatewayHistory,
    GatewaySessionStore,
    GlobalPaths,
} from "../../ai-gateway/index.js";

// Ensure all adapters are registered
import "../../ai-gateway/adapters/index.js";

export async function runGateway(
    opts:       GlobalOptions,
    subcommand: string,
    cmdOpts:    Record<string, any>
): Promise<void> {
    const ctx = createKernelContext(opts.project, opts.workspace);

    switch (subcommand) {
        case "run": {
            const providerId = cmdOpts.provider as string | undefined;
            if (!providerId) {
                logger.log(failure("Error: --provider <id> is required for run subcommand."));
                process.exit(1);
            }

            const extraArgs = cmdOpts.args as string[] ?? [];
            
            // Extract original prompt from non-flag arguments
            let originalPrompt = "";
            const promptArgs = extraArgs.filter(arg => !arg.startsWith("-"));
            if (promptArgs.length > 0) {
                originalPrompt = promptArgs.join(" ");
            } else {
                originalPrompt = "General workspace optimization";
            }

            // LiveConsole subscribes only through the event bus
            new LiveConsole(ctx.eventBus as any, { noColor: !process.stdout.isTTY });

            try {
                await runGatewaySession(ctx, providerId, originalPrompt, extraArgs);
            } catch (err: any) {
                logger.log(failure(`Execution failed: ${err.message}`));
                process.exit(1);
            }
            break;
        }

        case "status": {
            const adapters = AdapterRegistry.list();

            // Load manifest for wrapper info
            let manifest: any = null;
            try {
                const { ManifestManager } = await import("../../installer/index.js");
                const { GlobalPaths } = await import("../../kernel/paths.js");
                const gp = new GlobalPaths();
                manifest = new ManifestManager(gp.wrappersDir);
            } catch { /* manifest not available */ }

            if (opts.json) {
                const list = [];
                for (const a of adapters) {
                    const detected = await a.detect();
                    const healthVal = await a.health();
                    const meta = a.metadata();
                    let realBinary = "";
                    try { realBinary = await a.resolvedBinaryPath(); } catch { /* not found */ }
                    const wrapperRecord = manifest?.get(a.id);
                    list.push({
                        id: a.id,
                        displayName: a.displayName,
                        detected,
                        health: healthVal,
                        realBinary,
                        wrapperPath: wrapperRecord?.wrapperPath ?? "",
                        wrapperHealth: wrapperRecord ? "installed" : "none",
                        supportsStreaming: meta.supportsStreaming,
                        capabilities: meta.capabilities,
                        version: a.version,
                    });
                }
                printJson({ ok: true, providers: list });
                return;
            }

            logger.log("🧠 \x1b[1mProject Brain — Provider Status\x1b[0m\n");
            for (const a of adapters) {
                const detected = await a.detect();
                const healthVal = await a.health();
                const meta = a.metadata();
                const statusStr = detected
                    ? (healthVal === "healthy" ? success("healthy") : warn(healthVal))
                    : "not found";

                logger.log(`  ${a.displayName.padEnd(24)} : ${statusStr}`);

                if (detected) {
                    try {
                        const realBin = await a.resolvedBinaryPath();
                        logger.log(`    Real binary:       ${realBin}`);
                    } catch { /* skip */ }

                    const wrapperRecord = manifest?.get(a.id);
                    if (wrapperRecord) {
                        logger.log(`    Wrapper binary:    ${wrapperRecord.wrapperPath}`);
                        logger.log(`    Wrapper version:   ${wrapperRecord.installerVersion}`);
                    } else {
                        logger.log(`    Wrapper:           not installed`);
                    }

                    logger.log(`    Streaming:         ${meta.supportsStreaming ? "yes" : "no"}`);
                    logger.log(`    Capabilities:      ${meta.capabilities.join(", ")}`);
                }
                logger.log("");
            }
            break;
        }

        case "history": {
            const limit = cmdOpts.limit ? Number(cmdOpts.limit) : 20;
            const sessions = await queryGatewayHistory(ctx, limit);

            if (opts.json) {
                printJson({ ok: true, sessions });
                return;
            }

            if (sessions.length === 0) {
                logger.log("No sessions found in global history.");
                return;
            }

            logger.log("🧠 \x1b[1mProject Brain — Recent Sessions\x1b[0m\n");
            const historyHelper = new GatewayHistory(new GatewaySessionStore(ctx.paths as any));
            const rows = historyHelper.toRows(sessions);
            logger.log(`  ${"Session".padEnd(12)} ${"Provider".padEnd(12)} ${"Time".padEnd(8)} ${"Duration".padEnd(10)} ${"Saving".padEnd(8)} ${"Prompt"}`);
            logger.log("  " + "─".repeat(80));
            for (const r of rows) {
                logger.log(`  ${r.id.padEnd(12)} ${r.provider.padEnd(12)} ${r.startedAt.padEnd(8)} ${r.duration.padEnd(10)} ${r.reduction.padEnd(8)} ${r.promptSnip}`);
            }
            break;
        }

        case "metrics": {
            const metrics = await getGatewayMetrics(ctx);
            if (opts.json) {
                printJson({ ok: true, metrics });
                return;
            }

            logger.log("╭─ 🧠 \x1b[1mProject Brain — Metrics\x1b[0m ──────────────────────────╮");
            logger.log(`│  Total Sessions       ${String(metrics.totalSessions).padEnd(32)} │`);
            
            const providersUsed = metrics.perProvider
                .map(p => `${p.providerId} (${p.sessionCount})`)
                .join(" · ");
            logger.log(`│  Providers Used       ${providersUsed.padEnd(32)} │`);
            logger.log("│                                                        │");
            logger.log("│  Token Savings                                         │");
            logger.log(`│    Avg Reduction      ${(Math.round(metrics.avgReductionPct) + "%").padEnd(32)} │`);
            logger.log(`│    Total Saved        ${(metrics.totalTokensSaved.toLocaleString() + " tokens").padEnd(32)} │`);
            logger.log(`│    Est. Money Saved   ${("$" + metrics.totalCostSaved.toFixed(2)).padEnd(32)} │`);
            logger.log("│                                                        │");
            logger.log("│  Performance                                           │");
            logger.log(`│    Avg Retrieval      ${(Math.round(metrics.avgRetrievalLatency) + "ms").padEnd(32)} │`);
            logger.log(`│    Avg Session        ${formatMs(metrics.avgSessionDuration).padEnd(32)} │`);
            logger.log("│                                                        │");
            logger.log("│  Learning                                              │");
            logger.log(`│    Patterns Recorded  ${String(metrics.learningPatterns).padEnd(32)} │`);
            logger.log("╰────────────────────────────────────────────────────────╯");
            break;
        }

        case "session": {
            const id = cmdOpts.id as string | undefined;
            if (!id) {
                logger.log(failure("Error: Session ID is required. Example: brain gateway session gs-a1b2c3d4"));
                process.exit(1);
            }

            const session = await findSessionById(ctx, id);
            if (!session) {
                logger.log(failure(`Error: Session "${id}" not found.`));
                process.exit(1);
            }

            if (opts.json) {
                printJson({ ok: true, session });
                return;
            }

            logger.log(`🧠 \x1b[1mProject Brain — Session Timeline [${id}]\x1b[0m\n`);
            for (const t of session.timeline) {
                const time = formatMs(t.elapsed).padStart(8);
                const detailStr = t.detail ? ` (${t.detail})` : "";
                logger.log(`  ${time}  ${t.label}${detailStr}`);
            }
            break;
        }

        case "diagnostics": {
            const globalPaths = new GlobalPaths(ctx.paths.brainDir); // Isolated diagnostics paths
            const report = await runDiagnosticsReport(globalPaths);
            if (opts.json) {
                printJson({ ok: true, report });
                return;
            }

            logger.log("🧠 \x1b[1mProject Brain — Diagnostics Report\x1b[0m\n");
            logger.log(`  Global Paths Ok   : ${report.globalPathsOk ? success("yes") : failure("no")}`);
            logger.log(`  Session Store Ok  : ${report.sessionStoreOk ? success("yes") : failure("no")}`);
            logger.log(`  Metrics Store Ok  : ${report.metricsStoreOk ? success("yes") : failure("no")}`);
            logger.log(`  PATH Contains Bin : ${report.pathContainsBin ? success("yes") : warn("no")}`);
            
            logger.log("\n  Supported Providers:");
            for (const a of report.adapters) {
                const stateStr = a.detected
                    ? (a.healthy ? success("healthy") : warn("degraded"))
                    : "not found";
                logger.log(`    - ${a.displayName.padEnd(20)}: ${stateStr}`);
            }
            break;
        }

        default:
            logger.log(`Unknown subcommand: ${subcommand}`);
            logger.log("Usage: brain gateway <run|status|history|metrics|session|diagnostics>");
            process.exit(1);
    }
}

// ─── Diagnostics Helper ───────────────────────────────────────────────────────

async function runDiagnosticsReport(paths: GlobalPaths): Promise<any> {
    const adapters = AdapterRegistry.list();
    const adapterDiags = [];

    for (const a of adapters) {
        let detected = false;
        let healthy = false;
        let statusStr: any = "unknown";
        let binaryPath: string | undefined;
        let errMsg: string | undefined;

        try {
            detected = await a.detect();
            binaryPath = await a.resolvedBinaryPath();
            statusStr = await a.health();
            healthy = statusStr === "healthy";
        } catch (err: any) {
            errMsg = err.message;
        }

        adapterDiags.push({
            id:          a.id,
            displayName: a.displayName,
            detected,
            healthy,
            status:      statusStr,
            binaryPath,
            error:       errMsg,
        });
    }

    const globalPathsOk = paths.allDirs().every(dir => fs.existsSync(dir));

    return {
        globalPathsOk,
        sessionStoreOk:  fs.existsSync(paths.sessionsDir),
        metricsStoreOk:  fs.existsSync(paths.aggregateMetricsPath),
        adapters:        adapterDiags,
        pathContainsBin: paths.isBinInPath(),
        timestamp:       new Date().toISOString(),
    };
}

function formatMs(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs % 60}s`;
}
