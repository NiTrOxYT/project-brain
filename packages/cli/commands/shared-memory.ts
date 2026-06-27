// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — shared-memory command
// brain shared-memory <subcommand>
// ──────────────────────────────────────────────────────────────────────────────

import { GlobalOptions } from "../main.js";
import { logger } from "../utils/logger.js";
import { printJson } from "../utils/json.js";
import { Spinner } from "../utils/spinner.js";
import { renderTable } from "../utils/table.js";
import { requireBrainInitialized } from "../utils/paths.js";
import { ValidationError } from "../utils/errors.js";
import { bold } from "../utils/colors.js";

type SharedMemSubcmd =
    | "status" | "agents" | "tasks" | "conflicts"
    | "consensus" | "snapshot" | "restore" | "statistics" | "diagnostics";

export async function runSharedMemory(
    opts: GlobalOptions,
    sub: SharedMemSubcmd,
    cmdOpts: Record<string, unknown>
): Promise<void> {
    requireBrainInitialized(opts.workspace);

    const { SharedMemoryService } = await import("../../shared-memory/service.js");
    const svc = new SharedMemoryService(opts.project, opts.workspace);

    const spinner = new Spinner("Loading shared memory...");
    spinner.start();

    try {
        switch (sub) {
            case "status": {
                // SharedMemoryService has getModel() via memory — use getMemory
                const model = (svc as any).model ?? {};
                const agentCount = model.agents?.size ?? 0;
                const taskCount  = model.tasks?.size  ?? 0;
                spinner.stop();
                const st = { agents: agentCount, tasks: taskCount, phase: model.phase ?? "idle" };
                if (opts.json) {
                    printJson({ ok: true, status: st });
                } else {
                    logger.log(bold("Shared Memory Status"));
                    logger.log(JSON.stringify(st, null, 2));
                }
                break;
            }

            case "agents": {
                const model = (svc as any).model ?? {};
                const agentMap: Map<string, any> = model.agents ?? new Map();
                const agents = [...agentMap.values()];
                spinner.stop();
                if (opts.json) {
                    printJson({ ok: true, agents });
                } else {
                    if (agents.length === 0) {
                        logger.log("No agents registered.");
                    } else {
                        logger.log(renderTable(
                            [
                                { header: "Agent ID", key: "id" },
                                { header: "Name",     key: "name" },
                                { header: "Phase",    key: "phase" },
                            ],
                            agents.map((a: any) => ({ id: a.id ?? "", name: a.name ?? "", phase: a.phase ?? "" }))
                        ));
                    }
                }
                break;
            }

            case "tasks": {
                const taskMap = svc.getTasks();
                const tasks   = [...taskMap.values()];
                spinner.stop();
                if (opts.json) {
                    printJson({ ok: true, tasks });
                } else {
                    if (tasks.length === 0) {
                        logger.log("No tasks registered.");
                    } else {
                        logger.log(renderTable(
                            [
                                { header: "Task ID",  key: "id" },
                                { header: "Title",    key: "title" },
                                { header: "Status",   key: "status" },
                            ],
                            tasks.map((t: any) => ({ id: t.id, title: t.title ?? "", status: t.status ?? "" }))
                        ));
                    }
                }
                break;
            }

            case "conflicts": {
                const conflicts = svc.detectConflicts();
                spinner.stop();
                if (opts.json) {
                    printJson({ ok: true, conflicts });
                } else {
                    logger.log(bold(`Conflicts: ${conflicts.length}`));
                    logger.log(JSON.stringify(conflicts, null, 2));
                }
                break;
            }

            case "consensus": {
                const model = (svc as any).model ?? {};
                const proposals = model.getState?.()?.proposals ?? [];
                spinner.stop();
                if (opts.json) {
                    printJson({ ok: true, proposals });
                } else {
                    logger.log(bold(`Proposals: ${proposals.length}`));
                    logger.log(JSON.stringify(proposals.slice(0, 10), null, 2));
                }
                break;
            }

            case "snapshot": {
                const snapshotId = cmdOpts["snapshot-id"] as string | undefined
                    ?? `snap-${Date.now()}`;
                const snap = await svc.snapshot(snapshotId);
                spinner.stop();
                if (opts.json) {
                    printJson({ ok: true, snapshotId: snap.snapshotId });
                } else {
                    logger.log(`Snapshot saved: ${snap.snapshotId}`);
                }
                break;
            }

            case "restore": {
                const snapshotId = cmdOpts["snapshot-id"] as string | undefined;
                if (!snapshotId) throw new ValidationError("--snapshot-id is required");
                await svc.restore(snapshotId);
                spinner.stop();
                if (opts.json) {
                    printJson({ ok: true, restored: snapshotId });
                } else {
                    logger.log(`Restored snapshot: ${snapshotId}`);
                }
                break;
            }

            case "statistics": {
                const { SharedMemoryMetricsTracker } = await import("../../shared-memory/metrics.js");
                const tracker = new SharedMemoryMetricsTracker();
                const model = (svc as any).model ?? {};
                const state = model.getState?.() ?? model;
                const stats = tracker.compute(state, state.eventsCount ?? 0);
                spinner.stop();
                if (opts.json) {
                    printJson({ ok: true, statistics: stats });
                } else {
                    logger.log(bold("Shared Memory Statistics"));
                    logger.log(JSON.stringify(stats, null, 2));
                }
                break;
            }

            case "diagnostics": {
                const { CollaborationDiagnostics } = await import("../../shared-memory/diagnostics.js");
                const diag = new CollaborationDiagnostics();
                const model = (svc as any).model ?? {};
                const state = model.getState?.() ?? model;
                const report = diag.build(state);
                spinner.stop();
                if (opts.json) {
                    printJson({ ok: true, diagnostics: report });
                } else {
                    logger.log(bold("Shared Memory Diagnostics"));
                    logger.log(JSON.stringify(report, null, 2));
                }
                break;
            }

            default: throw new ValidationError(`Unknown shared-memory subcommand: ${sub}`);
        }
    } catch (err) {
        spinner.stop();
        throw err;
    }
}
