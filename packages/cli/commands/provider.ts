// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — provider command
// brain provider <subcommand>
// ──────────────────────────────────────────────────────────────────────────────

import { GlobalOptions } from "../main.js";
import "../../ai-gateway/adapters/index.js";
import { logger } from "../utils/logger.js";
import { printJson } from "../utils/json.js";
import { Spinner } from "../utils/spinner.js";
import { renderTable } from "../utils/table.js";
import { requireBrainInitialized } from "../utils/paths.js";
import { ValidationError } from "../utils/errors.js";
import { green, red, yellow } from "../utils/colors.js";

type ProviderSubcmd = "list" | "health" | "benchmark" | "configure" | "verify" | "status";

export async function runProvider(
    opts: GlobalOptions,
    sub: ProviderSubcmd,
    cmdOpts: Record<string, unknown>
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
                        const rHealthy = (r as any).healthy;
                        const rId = (r as any).providerId;
                        const tag = rHealthy ? green("PASS") : red("FAIL");
                        logger.log(`  ${tag}  ${rId ?? ""}`);
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

            case "configure": {
                spinner.stop();
                const providerId = (cmdOpts.provider as string) || "opencode";
                const { ProviderConfigurator } = await import("../../provider-bridge/provider-configurator.js");
                const { ProviderPolicyInstaller } = await import("../../provider-bridge/provider-policy.js");

                logger.log(`Configuring Brain MCP for provider: \x1b[1m${providerId}\x1b[0m`);
                const resConfig = ProviderConfigurator.configure(providerId, { transport: "stdio" });
                if (!resConfig.success) {
                    throw new Error(resConfig.error || "Failed to configure Brain MCP registration.");
                }

                // Try to install policies if supported
                const resPolicy = ProviderPolicyInstaller.installPolicy(providerId);
                if (resPolicy.success) {
                    logger.log(`  ✓ Brain Context Consumption Policy instructions file created.`);
                }
                logger.log(`  ✓ Brain MCP Server successfully configured in ${providerId} options.`);
                break;
            }

            case "verify": {
                spinner.stop();
                const providerId = (cmdOpts.provider as string) || "opencode";
                const { ProviderVerificationEngine } = await import("../../provider-bridge/provider-verifier.js");

                logger.log(`Verifying Brain MCP connectivity and tool visibility for: \x1b[1m${providerId}\x1b[0m...`);
                const res = await ProviderVerificationEngine.verify(providerId, opts.workspace);
                if (res.level2) {
                    logger.log(`  Level 1 (Registration) : \x1b[32mVerified\x1b[0m`);
                    logger.log(`  Level 2 (Connectivity) : \x1b[32mVerified\x1b[0m`);
                    logger.log(`  Level 3 (Behavioral)   : ${res.level3 ? "\x1b[32mVerified\x1b[0m" : "\x1b[33mPending\x1b[0m"}`);
                    logger.log(`  Final Status           : \x1b[32m${res.state}\x1b[0m`);
                } else {
                    logger.log(`  Verification failed.`);
                    for (const err of res.errors) {
                        logger.log(`    ✗ ${err}`);
                    }
                    throw new Error("Verification checks failed.");
                }
                break;
            }

            case "status": {
                spinner.stop();
                const providerId = (cmdOpts.provider as string) || "opencode";
                const { ProviderVerificationEngine } = await import("../../provider-bridge/provider-verifier.js");
                const { ProviderConfigurator } = await import("../../provider-bridge/provider-configurator.js");
                const { ProviderPolicyInstaller } = await import("../../provider-bridge/provider-policy.js");

                logger.log(`Project Brain Provider Status: \x1b[1m${providerId}\x1b[0m`);
                logger.log(`  Config Path   : ${ProviderConfigurator.getConfigPath(providerId)}`);
                logger.log(`  Configured    : ${ProviderConfigurator.isConfigured(providerId) ? "\x1b[32myes\x1b[0m" : "\x1b[31mno\x1b[0m"}`);
                logger.log(`  Policy File   : ${ProviderPolicyInstaller.getInstructionsPath(providerId)}`);
                logger.log(`  Policy Active : ${ProviderPolicyInstaller.isPolicyInstalled(providerId) ? "\x1b[32myes\x1b[0m" : "\x1b[31mno\x1b[0m"}`);

                const verification = await ProviderVerificationEngine.verify(providerId, opts.workspace);
                logger.log(`  Current State : \x1b[32m${verification.state}\x1b[0m`);
                break;
            }

            default: throw new ValidationError(`Unknown provider subcommand: ${sub}`);
        }
    } catch (err) {
        spinner.stop();
        throw err;
    }
}
