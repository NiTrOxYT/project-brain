// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — workflow command
// brain workflow <subcommand>
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { logger } from "../utils/logger.js";
import { printJson } from "../utils/json.js";
import { Spinner } from "../utils/spinner.js";
import { renderTable, renderKeyValue } from "../utils/table.js";
import { requireBrainInitialized, brainDir } from "../utils/paths.js";
import { ValidationError } from "../utils/errors.js";
import { bold, yellow, gray } from "../utils/colors.js";
export async function runWorkflow(opts, sub, cmdOpts) {
    requireBrainInitialized(opts.workspace);
    switch (sub) {
        case "run": return workflowRun(opts, cmdOpts);
        case "resume": return workflowResume(opts, cmdOpts);
        case "cancel": return workflowCancel(opts, cmdOpts);
        case "status": return workflowStatus(opts, cmdOpts);
        case "history": return workflowHistory(opts);
        case "report": return workflowReport(opts, cmdOpts);
        case "diagnostics": return workflowDiagnostics(opts, cmdOpts);
        default: throw new ValidationError(`Unknown workflow subcommand: ${sub}`);
    }
}
async function workflowRun(opts, cmdOpts) {
    if (!cmdOpts.issue)
        throw new ValidationError("--issue is required");
    const { AutonomousWorkflowService } = await import("../../autonomous-workflow/service.js");
    const workflowId = `wf-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
    const spinner = new Spinner(`Running workflow: ${cmdOpts.issue}`);
    spinner.start();
    const t0 = Date.now();
    try {
        const svc = new AutonomousWorkflowService(opts.project, opts.workspace);
        const result = await svc.run({
            workflowId,
            issue: cmdOpts.issue,
            projectRoot: opts.project,
            workspaceRoot: opts.workspace,
        });
        const ms = Date.now() - t0;
        const ok = result.status === "Completed";
        if (opts.json) {
            spinner.stop();
            printJson({ ok, workflowId, status: result.status, durationMs: ms, report: result.report });
        }
        else {
            ok ? spinner.succeed(`Workflow completed (${ms} ms)`) : spinner.fail(`Workflow ${result.status}`);
            logger.log(`  ID:       ${workflowId}`);
            logger.log(`  Status:   ${result.status}`);
            if (result.report) {
                logger.log(`  Tasks:    ${result.report.taskGraph?.nodes?.length ?? 0} total`);
                logger.log(`  Files:    ${result.report.changedFiles?.length ?? 0} changed`);
            }
        }
    }
    catch (err) {
        spinner.fail("Workflow failed");
        throw err;
    }
}
async function workflowResume(opts, cmdOpts) {
    if (!cmdOpts.workflowId)
        throw new ValidationError("--workflow-id is required");
    const { AutonomousWorkflowService } = await import("../../autonomous-workflow/service.js");
    const spinner = new Spinner(`Resuming workflow ${cmdOpts.workflowId}...`);
    spinner.start();
    try {
        const svc = new AutonomousWorkflowService(opts.project, opts.workspace);
        const result = await svc.resume(cmdOpts.workflowId);
        const ok = result.status === "Completed";
        if (opts.json) {
            spinner.stop();
            printJson({ ok, workflowId: cmdOpts.workflowId, status: result.status, report: result.report });
        }
        else {
            ok ? spinner.succeed("Workflow resumed and completed") : spinner.fail(`Workflow ${result.status}`);
            logger.log(`  Status: ${result.status}`);
        }
    }
    catch (err) {
        spinner.fail("Resume failed");
        throw err;
    }
}
async function workflowCancel(opts, cmdOpts) {
    if (!cmdOpts.workflowId)
        throw new ValidationError("--workflow-id is required");
    const { AutonomousWorkflowService } = await import("../../autonomous-workflow/service.js");
    const svc = new AutonomousWorkflowService(opts.project, opts.workspace);
    await svc.cancel(cmdOpts.workflowId);
    if (opts.json) {
        printJson({ ok: true, workflowId: cmdOpts.workflowId, status: "cancelled" });
    }
    else {
        logger.log(`${yellow("⚠")} Workflow ${bold(cmdOpts.workflowId)} cancel requested`);
    }
}
async function workflowStatus(opts, cmdOpts) {
    if (!cmdOpts.workflowId)
        throw new ValidationError("--workflow-id is required");
    const { AutonomousWorkflowService } = await import("../../autonomous-workflow/service.js");
    const svc = new AutonomousWorkflowService(opts.project, opts.workspace);
    const status = svc.status(cmdOpts.workflowId);
    if (opts.json) {
        printJson({ ok: true, workflowId: cmdOpts.workflowId, state: status.state });
    }
    else {
        logger.log(renderKeyValue([
            ["Workflow ID", cmdOpts.workflowId],
            ["State", status.state ?? "unknown"],
        ]));
    }
}
async function workflowHistory(opts) {
    const dir = path.join(brainDir(opts.workspace), "journal");
    const entries = [];
    if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir).filter(f => f.endsWith(".jsonl"));
        for (const f of files.slice(-20)) {
            const id = f.replace(/\.jsonl$/, "");
            try {
                const lines = fs.readFileSync(path.join(dir, f), "utf-8").trim().split("\n");
                const first = lines[0] ? JSON.parse(lines[0]) : {};
                const last = lines[lines.length - 1] ? JSON.parse(lines[lines.length - 1]) : {};
                entries.push({
                    id,
                    status: last.type === "WorkflowCompleted" ? "Completed" :
                        last.type === "WorkflowFailed" ? "Failed" : "Unknown",
                    startedAt: first.timestamp ?? "",
                });
            }
            catch { /* skip corrupt */ }
        }
    }
    if (opts.json) {
        printJson({ ok: true, workflows: entries });
    }
    else {
        if (entries.length === 0) {
            logger.log(gray("No workflow history found."));
            return;
        }
        logger.log(renderTable([
            { header: "ID", key: "id", width: 36 },
            { header: "Status", key: "status", width: 12 },
            { header: "Started At", key: "startedAt", width: 26 },
        ], entries));
    }
}
async function workflowReport(opts, cmdOpts) {
    if (!cmdOpts.workflowId)
        throw new ValidationError("--workflow-id is required");
    const { AutonomousWorkflowService } = await import("../../autonomous-workflow/service.js");
    const svc = new AutonomousWorkflowService(opts.project, opts.workspace);
    const report = svc.report(cmdOpts.workflowId);
    if (opts.json) {
        printJson({ ok: true, report });
    }
    else {
        logger.log(bold("Workflow Report: ") + cmdOpts.workflowId);
        logger.log(JSON.stringify(report, null, 2));
    }
}
async function workflowDiagnostics(opts, cmdOpts) {
    if (!cmdOpts.workflowId)
        throw new ValidationError("--workflow-id is required");
    const { AutonomousWorkflowService } = await import("../../autonomous-workflow/service.js");
    const svc = new AutonomousWorkflowService(opts.project, opts.workspace);
    const diag = svc.diagnostics(cmdOpts.workflowId);
    if (opts.json) {
        printJson({ ok: true, diagnostics: diag });
    }
    else {
        logger.log(bold("Workflow Diagnostics"));
        logger.log(JSON.stringify(diag, null, 2));
    }
}
