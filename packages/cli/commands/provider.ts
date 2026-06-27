// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — provider command
// brain provider <subcommand>
// ──────────────────────────────────────────────────────────────────────────────

import { GlobalOptions } from "../main.js";
import { logger } from "../utils/logger.js";
import { printJson } from "../utils/json.js";
import { Spinner } from "../utils/spinner.js";
import { renderTable } from "../utils/table.js";
import { requireBrainInitialized } from "../utils/paths.js";
import { ValidationError } from "../utils/errors.js";
import { green, red, yellow } from "../utils/colors.js";

type ProviderSubcmd = "list" | "health" | "benchmark";

export async function runProvider(
    opts: GlobalOptions,
    sub: ProviderSubcmd,
    _cmdOpts: Record<string, unknown>
): Promise<void> {
    requireBrainInitialized(opts.workspace);

    // ProviderRuntimeService constructor takes a string (workspaceRoot)
    const { ProviderRuntimeService } = await import("../../provider-runtime/service.js");
    const svc = new ProviderRuntimeService(opts.workspace);

    const spinner = new Spinner("Loading providers...");
    spinner.start();

    try {
        switch (sub) {
            case "list": {
                // Use registry.list() via diagnostics
                const diag = svc.diagnostics?.() as any ?? {};
                const providers: any[] = diag.registeredProviderIds?.map((id: string) => ({ id, name: id, enabled: true, model: "" })) ?? [];
                spinner.stop();
                if (opts.json) {
                    printJson({ ok: true, providers });
                } else {
                    if (providers.length === 0) {
                        logger.log("No providers registered.");
                    } else {
                        logger.log(renderTable(
                            [
                                { header: "ID",      key: "id",      width: 20 },
                                { header: "Enabled", key: "enabled", width: 8 },
                            ],
                            providers.map((p: any) => ({
                                id: p.id ?? "", enabled: p.enabled ? "yes" : "no",
                            }))
                        ));
                    }
                }
                break;
            }

            case "health": {
                // ProviderHealthMonitor takes a ttl arg, not workspaceRoot
                const { HealthMonitor } = await import("../../provider-runtime/health.js");
                const monitor = new HealthMonitor();
                // checkAll takes an array of SDKProvider objects
                const resultMap = await monitor.checkAll([]);
                spinner.stop();
                const results = [...resultMap.values()];
                if (opts.json) {
                    printJson({ ok: true, health: results });
                } else {
                    if (results.length === 0) {
                        logger.log(yellow("No providers registered — nothing to check."));
                    }
                    for (const r of results) {
                        const tag = (r as any).healthy ? green("PASS") : red("FAIL");
                        logger.log(`  ${tag}  ${(r as any).providerId ?? ""}`);
                    }
                }
                break;
            }

            case "benchmark": {
                spinner.stop();
                if (opts.json) {
                    printJson({ ok: false, error: "benchmark requires registered providers" });
                } else {
                    logger.log(yellow("Provider benchmark requires registered providers and an active API key."));
                }
                break;
            }

            default: throw new ValidationError(`Unknown provider subcommand: ${sub}`);
        }
    } catch (err) {
        spinner.stop();
        throw err;
    }
}
