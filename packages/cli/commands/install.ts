// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061D — CLI — install command
// brain install  →  Zero-touch, self-healing provider installation
// ──────────────────────────────────────────────────────────────────────────────

import { GlobalOptions } from "../main.js";
import { logger } from "../utils/logger.js";
import { printJson } from "../utils/json.js";
import { success, warn, bold } from "../utils/colors.js";
import { createKernelContext, runGatewayInstaller } from "../../sdk/index.js";
import type { SdkInstallOptions } from "../../sdk/index.js";
import {
    EXIT_SUCCESS,
    EXIT_FATAL,
    EXIT_SHELL_CONFIG_DENIED,
    EXIT_PROVIDER_DISCOVERY,
    EXIT_WRAPPER_VALIDATION,
    INSTALLER_VERSION,
} from "../../installer/index.js";

// Ensure all adapters are registered before execution
import "../../ai-gateway/adapters/index.js";

export async function runInstall(
    opts:    GlobalOptions,
    cmdOpts: SdkInstallOptions
): Promise<void> {
    const ctx = createKernelContext(opts.project, opts.workspace);

    if (!opts.json && !opts.quiet) {
        logger.log("");
        logger.log("🧠 \\x1b[1mProject Brain Installer\\x1b[0m");
        logger.log("──────────────────────────────────────");
    }

    try {
        const result = await runGatewayInstaller(ctx, cmdOpts);

        // Configure and validate providers
        const { ProviderConfigurator } = await import("../../provider-bridge/provider-configurator.js");
        const { ProviderPolicyInstaller } = await import("../../provider-bridge/provider-policy.js");

        if (cmdOpts.uninstall) {
            for (const disc of result.discovered) {
                ProviderConfigurator.unconfigure(disc.id);
                ProviderPolicyInstaller.removePolicy(disc.id);
            }
            if (opts.json) {
                printJson({ ok: true, ...result });
                return;
            }
            if (opts.quiet) return;
            logger.log(success("Project Brain wrappers successfully uninstalled."));
            if (result.removed.length > 0) {
                logger.log("Removed: " + result.removed.map(r => r.id).join(", "));
            }
            return;
        }

        // Configure all discovered supported providers
        for (const disc of result.discovered) {
            if (disc.id === "opencode" || disc.id === "claude") {
                if (!opts.quiet) {
                    logger.log(`Configuring Brain MCP for provider: ${disc.id}...`);
                }
                const confRes = ProviderConfigurator.configure(disc.id, { transport: "stdio" });
                if (!confRes.success) {
                    throw new Error(`Failed to configure MCP registration for ${disc.id}: ${confRes.error}`);
                }

                // Install policy instructions file
                const polRes = ProviderPolicyInstaller.installPolicy(disc.id);
                if (!polRes.success) {
                    throw new Error(`Failed to install policy instructions for ${disc.id}: ${polRes.error}`);
                }

                // Immediately validate configuration by reading it back from disk
                const isValid = ProviderConfigurator.isConfigured(disc.id);
                if (!isValid) {
                    throw new Error(`Validation failed: Brain MCP registration not present in ${disc.id} config after write.`);
                }
                if (!opts.quiet) {
                    logger.log(`  ✓ Configuration successfully merged and validated for ${disc.id}`);
                }
            }
        }

        if (opts.json) {
            printJson({ ok: true, ...result });
            return;
        }

        if (opts.quiet) return;

        // ── Step 1: Platform ─────────────────────────────────────────────
        const shellInfo = result.pathResult
            ? `${result.pathResult.shellRestart ? "restart needed" : "ready"}`
            : "";
        if (result.diagnostics.length > 0) {
            const platformCheck = result.diagnostics.find(d => d.name === "Global directories");
            if (platformCheck) {
                logger.log(`\\nStep 1/5  Detecting platform…`);
                logger.log(`  ${platformCheck.status === "pass" ? "✓" : "✗"}  ${process.platform === "darwin" ? "macOS" : process.platform === "win32" ? "Windows" : "Linux"}`);
            }
        }

        // ── Step 2: Discovery ────────────────────────────────────────────
        logger.log("──────────────────────────────────────");
        logger.log(`Step 2/5  Discovering providers…`);
        if (result.discovered.length === 0) {
            logger.log(warn("  No providers discovered in PATH."));
        } else {
            for (const d of result.discovered) {
                const tag = d.status === "new" ? " (new)" :
                            d.status === "outdated" ? " (update)" :
                            d.status === "corrupted" ? " (repair)" : "";
                logger.log(`  ✓  ${d.displayName.padEnd(22)} ${d.binaryPath}${tag}`);
            }
        }

        // ── Step 3: Wrappers ─────────────────────────────────────────────
        logger.log("──────────────────────────────────────");
        logger.log(`Step 3/5  Generating wrappers…`);
        for (const g of result.generated) {
            const icon = g.action === "skipped" ? "—" : "✓";
            logger.log(`  ${icon}  ${g.id.padEnd(22)} ${g.action}`);
        }

        // ── Step 4: PATH ─────────────────────────────────────────────────
        logger.log("──────────────────────────────────────");
        logger.log(`Step 4/5  Updating PATH…`);
        if (result.pathResult) {
            if (result.pathResult.alreadyInPath) {
                logger.log("  ✓  PATH already configured");
            } else if (result.pathResult.updated) {
                logger.log("  ✓  PATH configured");
            } else if (result.pathResult.denied) {
                logger.log(warn("  ⚠  PATH update declined by user"));
                if (result.pathResult.instruction) {
                    logger.log(`     ${result.pathResult.instruction}`);
                }
            }
            if (result.pathResult.shellRestart && result.pathResult.instruction) {
                logger.log(`  ℹ  ${result.pathResult.instruction}`);
            }
        }

        // ── Step 5: Diagnostics ──────────────────────────────────────────
        logger.log("──────────────────────────────────────");
        logger.log(`Step 5/5  Running diagnostics…`);
        for (const d of result.diagnostics) {
            const icon = d.status === "pass" ? "✓" : d.status === "warn" ? "⚠" : "✗";
            logger.log(`  ${icon}  ${d.name}`);
        }

        // ── Removed providers ────────────────────────────────────────────
        if (result.removed.length > 0) {
            logger.log("");
            for (const r of result.removed) {
                logger.log(`  ⊘  ${r.id} — ${r.action}`);
            }
        }

        // ── Warnings ─────────────────────────────────────────────────────
        if (result.warnings.length > 0) {
            logger.log("");
            for (const w of result.warnings) {
                logger.log(warn(`  ⚠  ${w}`));
            }
        }

        // ── Summary ──────────────────────────────────────────────────────
        logger.log("──────────────────────────────────────");
        const wrapperCount = result.generated.filter(g => g.action !== "skipped").length;
        logger.log(success(`Installation completed. ${wrapperCount} wrapper(s) installed. (v${INSTALLER_VERSION})`));
        logger.log("Run: \\x1b[36mbrain gateway status\\x1b[0m");

        // ── Exit code logic ──────────────────────────────────────────────
        if (result.pathResult?.denied) {
            process.exitCode = EXIT_SHELL_CONFIG_DENIED;
        } else if (result.discovered.length === 0 && !cmdOpts.repair) {
            process.exitCode = EXIT_PROVIDER_DISCOVERY;
        } else if (result.diagnostics.some(d => d.status === "fail" && d.name.startsWith("Exec:"))) {
            process.exitCode = EXIT_WRAPPER_VALIDATION;
        }

    } catch (err: any) {
        if (opts.json) {
            printJson({ ok: false, error: err.message });
        } else {
            logger.log(`\\x1b[31mError during install: ${err.message}\\x1b[0m`);
        }
        process.exit(EXIT_FATAL);
    }
}
