// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — CLI — explain command
// brain explain <session-id>  →  Full deterministic session explanation
// ──────────────────────────────────────────────────────────────────────────────

import { GlobalOptions } from "../main.js";
import { logger } from "../utils/logger.js";
import { printJson } from "../utils/json.js";
import { success, failure } from "../utils/colors.js";
import { createKernelContext, findSessionById } from "../../sdk/index.js";

export async function runExplain(
    opts:      GlobalOptions,
    sessionId: string | undefined
): Promise<void> {
    if (!sessionId) {
        logger.log(failure("Error: Session ID is required. Example: brain explain gs-a1b2c3d4"));
        process.exit(1);
    }

    const ctx = createKernelContext(opts.project, opts.workspace);
    const session = await findSessionById(ctx, sessionId);

    if (!session) {
        logger.log(failure(`Error: Session "${sessionId}" not found in history.`));
        process.exit(1);
    }

    if (opts.json) {
        printJson({ ok: true, session });
        return;
    }

    const diff = session.diff;
    const m    = session.metrics;

    logger.log("╭─ 🧠 \x1b[1mProject Brain — Session Explanation\x1b[0m ──────────────────────╮");
    logger.log(`│  Session      ${session.id.padEnd(46)} │`);
    logger.log(`│  Provider     ${session.providerId.padEnd(46)} │`);
    
    const duration = formatDuration(session.startedAt, session.completedAt);
    logger.log(`│  Duration     ${duration.padEnd(46)} │`);
    logger.log("│                                                        │");

    logger.log("│  \x1b[1mWhat Project Brain Did\x1b[0m                                │");
    logger.log("│  ──────────────────────                                │");
    logger.log("│  ✓ Analyzed prompt intent                              │");
    if (m) {
        logger.log(`│  ✓ Retrieved ${String(m.retrievedFiles).padEnd(2)} relevant file${m.retrievedFiles !== 1 ? "s" : " "} from workspace           │`);
    } else {
        logger.log("│  ✓ Retrieved relevant context from workspace           │");
    }
    
    const hits = m?.learningHits ?? 0;
    if (hits > 0) {
        logger.log(`│  ✓ Applied ${String(hits).padEnd(2)} optimization pattern${hits !== 1 ? "s" : " "} from history            │`);
    }

    if (diff) {
        logger.log(`│  ✓ Reduced prompt by ${String(diff.savedPct).padEnd(2)}% (${diff.savedTokens.toLocaleString()} tokens saved)        │`);
    }
    logger.log(`│  ✓ Launched ${session.providerId.padEnd(10)} with optimized context              │`);
    logger.log("│                                                        │");

    if (diff) {
        logger.log("│  \x1b[1mPrompt Changes\x1b[0m                                        │");
        logger.log("│  ──────────────                                        │");
        for (const chunk of diff.removed.slice(0, 5)) {
            const labelStr = chunk.label.slice(0, 24).padEnd(24);
            const tokensStr = ("-" + chunk.tokenCount.toLocaleString() + " tokens").padStart(14);
            logger.log(`│  Removed  ${labelStr} ${tokensStr.padEnd(14)} │`);
        }
        for (const chunk of diff.added.slice(0, 5)) {
            const labelStr = chunk.label.slice(0, 24).padEnd(24);
            const tokensStr = ("+" + chunk.tokenCount.toLocaleString() + " tokens").padStart(14);
            logger.log(`│  Added    ${labelStr} ${tokensStr.padEnd(14)} │`);
        }
        logger.log("│                                                        │");

        logger.log("│  \x1b[1mToken & Cost Breakdown\x1b[0m                                │");
        logger.log("│  ─────────────────────                                │");
        logger.log(`│  Original prompt     ${(diff.tokensBefore.toLocaleString() + " tokens").padEnd(30)} │`);
        logger.log(`│  Optimized prompt    ${(diff.tokensAfter.toLocaleString() + " tokens").padEnd(30)} │`);
        
        const blendedCostBefore = (diff.tokensBefore / 1000) * 0.003;
        const blendedCostAfter  = (diff.tokensAfter / 1000) * 0.003;
        logger.log(`│  Without Brain       ${("$" + blendedCostBefore.toFixed(4)).padEnd(30)} │`);
        logger.log(`│  With Brain          ${("$" + blendedCostAfter.toFixed(4)).padEnd(30)} │`);
        logger.log(`│  Estimated Savings   ${("$" + diff.estimatedSavedUsd.toFixed(4) + ` (${diff.savedPct}%)`).padEnd(30)} │`);
    }

    logger.log("╰────────────────────────────────────────────────────────╯");
}

function formatDuration(startedAt: string, completedAt?: string): string {
    if (!completedAt) return "—";
    const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
    if (ms < 0) return "—";
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs % 60}s`;
}
