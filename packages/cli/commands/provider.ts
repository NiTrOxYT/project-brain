// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — provider command
// brain provider <subcommand> [provider]
// ──────────────────────────────────────────────────────────────────────────────

import { GlobalOptions } from "../main.js";
import "../../ai-gateway/adapters/index.js";
import { logger } from "../utils/logger.js";
import { printJson } from "../utils/json.js";
import { Spinner } from "../utils/spinner.js";
import { requireBrainInitialized } from "../utils/paths.js";
import { ValidationError } from "../utils/errors.js";
import { green, red, yellow, cyan, bold } from "../utils/colors.js";
import { ProviderDiscoveryEngine } from "../../provider-bridge/discovery.js";
import { ProviderConfigurator } from "../../provider-bridge/provider-configurator.js";
import { ProviderVerificationEngine } from "../../provider-bridge/provider-verifier.js";
import { ProviderSchemaRegistry } from "../../provider-bridge/schema-registry.js";
import { ProviderPolicyInstaller } from "../../provider-bridge/provider-policy.js";
import { ProviderLockRegistry } from "../../provider-bridge/provider-lock.js";
import { ProviderCompatibilityRegistry, compareVersions } from "../../provider-bridge/provider-compatibility.js";
import { ProviderHealthRegistry } from "../../provider-bridge/provider-health.js";
import { runInstall } from "./install.js";
import fs from "fs";

type ProviderSubcmd =
    | "list"
    | "health"
    | "benchmark"
    | "configure"
    | "verify"
    | "status"
    | "install"
    | "uninstall"
    | "diagnose"
    | "repair"
    | "update"
    | "audit";

export async function runProvider(
    opts: GlobalOptions,
    sub: ProviderSubcmd,
    cmdOpts: Record<string, unknown>
): Promise<void> {
    requireBrainInitialized(opts.workspace);

    const providerId = (cmdOpts.provider as string) || "opencode";

    switch (sub) {
        case "list": {
            const list = ProviderSchemaRegistry.list();
            if (opts.json) {
                printJson({ ok: true, providers: list.map(s => s.providerId) });
            } else {
                logger.log(bold("\nSupported Phase 1 Providers:\n"));
                for (const s of list) {
                    const activePathRes = ProviderConfigurator.getActiveConfigPath(s.providerId, opts.workspace);
                    const configured = ProviderConfigurator.isConfigured(s.providerId, opts.workspace);
                    logger.log(`  - ${bold(s.providerId.padEnd(15))} [${configured ? green("Configured") : yellow("Not Configured")}]`);
                    logger.log(`    Active Config  : ${activePathRes.path}`);
                    logger.log(`    Transports     : ${s.manifest.capabilities.supportsStdioMcp ? "stdio" : ""} ${s.manifest.capabilities.supportsHttpMcp ? "http" : ""}`);
                }
                logger.blank();
            }
            break;
        }

        case "install": {
            // Delegate to wrapper/interceptor installer
            await runInstall(opts, {
                providerId,
                uninstall: false,
                repair: false,
                dryRun: false
            });
            break;
        }

        case "uninstall": {
            // Delegate to uninstaller
            await runInstall(opts, {
                providerId,
                uninstall: true,
                repair: false,
                dryRun: false
            });
            break;
        }

        case "configure": {
            logger.log(`Configuring Brain MCP for provider: \x1b[1m${providerId}\x1b[0m`);
            const confRes = await ProviderConfigurator.configure(providerId, { transport: "stdio" }, opts.workspace);
            if (!confRes.success) {
                throw new Error(confRes.error || "Failed to configure Brain MCP registration.");
            }

            // Install policies if supported
            const polRes = ProviderPolicyInstaller.installPolicy(providerId);
            if (polRes.success) {
                logger.log(`  ✓ Brain Context Consumption Policy instructions created.`);
            }
            logger.log(`  ✓ Brain MCP Server successfully configured.`);
            break;
        }

        case "verify": {
            const spinner = new Spinner(`Running verification for ${providerId}...`);
            spinner.start();
            try {
                const res = await ProviderVerificationEngine.verify(providerId, opts.workspace);
                spinner.stop();

                if (opts.json) {
                    printJson({ ok: res.level3, ...res });
                    return;
                }

                logger.log(`\nVerification Report: \x1b[1m${providerId}\x1b[0m`);
                logger.log(`  Stage 1 (Installation) : ${res.stages.installation === "Passed" ? green("Passed") : red("Failed")}`);
                logger.log(`  Stage 2 (Configuration) : ${res.stages.configuration === "Passed" ? green("Passed") : red("Failed")}`);
                logger.log(`  Stage 3 (Connectivity)  : ${res.stages.connectivity === "Passed" ? green("Passed") : res.stages.connectivity === "Skipped" ? cyan("Skipped") : red("Failed")}`);
                logger.log(`  Stage 4 (Behavioral)    : ${res.stages.behavioral === "Passed" ? green("Passed") : res.stages.behavioral === "Skipped" ? cyan("Skipped") : red("Failed")}`);
                logger.log(`  Final Status           : \x1b[1m${res.state}\x1b[0m`);

                if (res.errors.length > 0) {
                    logger.blank();
                    logger.log(red("Errors encountered:"));
                    for (const err of res.errors) {
                        logger.log(red(`  ✗ ${err}`));
                    }
                    throw new Error("Verification failed.");
                }
            } catch (err) {
                spinner.stop();
                throw err;
            }
            break;
        }

        case "diagnose": {
            const spinner = new Spinner(`Diagnosing ${providerId}...`);
            spinner.start();
            try {
                const res = await ProviderVerificationEngine.verify(providerId, opts.workspace);
                spinner.stop();

                logger.log(`\nDiagnostics Report: \x1b[1m${providerId}\x1b[0m`);
                logger.log(`  Status: ${res.state === "Brain Optimized" || res.state === "Brain Enabled" ? green(res.state) : red(res.state)}`);

                if (res.errors.length > 0) {
                    logger.blank();
                    logger.log(bold("Suggested Remediation Steps:"));
                    for (const err of res.errors) {
                        logger.log(`  - ${yellow(err)}`);
                        if (err.includes("installation")) {
                            logger.log(`    👉 Ensure ${providerId} is installed on your system and is accessible in your PATH.`);
                        } else if (err.includes("registration") || err.includes("missing")) {
                            logger.log(`    👉 Run: ${cyan(`brain provider configure ${providerId}`)} to write configuration files.`);
                        } else if (err.includes("handshake") || err.includes("spawn")) {
                            logger.log(`    👉 Run: ${cyan(`brain provider repair ${providerId}`)} to self-heal executable wrapper permissions.`);
                        }
                    }
                } else {
                    logger.log(green("  ✓ Diagnostics complete. No issues found."));
                }
            } catch (err) {
                spinner.stop();
                throw err;
            }
            break;
        }

        case "status": {
            const disc = ProviderDiscoveryEngine.discover(providerId, opts.workspace);
            const res = await ProviderVerificationEngine.verify(providerId, opts.workspace);
            const schema = ProviderSchemaRegistry.get(providerId);

            if (opts.json) {
                printJson({ disc, verification: res });
                return;
            }

            const activeConfigPath = ProviderConfigurator.getActiveConfigPath(providerId, opts.workspace);

            logger.log(bold(`\n${bold("brain provider status")} — Status Report`));
            logger.log(`─`.repeat(50));
            logger.log(`  Provider              : ${providerId}`);
            logger.log(`  Version               : ${disc?.version || "Not Installed"}`);
            logger.log(`  Executable            : ${disc?.executable || "Not Found"}`);
            logger.log(`  Configuration Mode    : ${disc?.activeConfiguration || "N/A"}`);
            logger.log(`  Configuration File(s) : ${activeConfigPath.path}`);
            logger.log(`  Schema Valid          : ${res.stages.configuration === "Passed" ? green("yes") : red("no")}`);
            logger.log(`  MCP Registered        : ${ProviderConfigurator.isConfigured(providerId, opts.workspace) ? green("yes") : red("no")}`);
            logger.log(`  MCP Connected         : ${res.stages.connectivity === "Passed" ? green("yes") : res.stages.connectivity === "Skipped" ? cyan("skipped") : red("no")}`);
            logger.log(`  Brain Tools Visible   : ${res.level3 ? green("yes") : red("no")}`);
            logger.log(`  Brain Enabled         : ${res.level3 ? green("yes") : red("no")}`);
            logger.log(`  Brain Optimized       : ${res.level4 ? green("yes") : red("no")}`);
            logger.log(`  Last Verification     : ${new Date().toISOString()}`);
            if (res.errors.length > 0) {
                logger.log(`  Errors                : ${red(res.errors[0])}`);
            } else {
                logger.log(`  Errors                : none`);
            }
            logger.log(`─`.repeat(50));
            logger.blank();
            break;
        }

        case "repair": {
            logger.log(`Attempting transaction configuration repair for ${providerId}...`);
            const confRes = await ProviderConfigurator.configure(providerId, { transport: "stdio" }, opts.workspace);
            if (!confRes.success) {
                ProviderConfigurator.rollback(providerId);
                throw new Error(`Repair failed during configuration phase: ${confRes.error}`);
            }

            // Install policy instructions
            ProviderPolicyInstaller.installPolicy(providerId);

            // Re-verify repaired state
            const res = await ProviderVerificationEngine.verify(providerId, opts.workspace);
            if (res.level3) {
                ProviderConfigurator.commit(providerId);
                logger.log(green("  ✓ Self-healing configuration repair completed successfully."));
            } else {
                // Rollback if verification failed
                ProviderConfigurator.rollback(providerId);
                throw new Error(`Repair aborted: config verification failed. Restored to pre-repair state.`);
            }
            break;
        }

        case "update": {
            logger.log(`Checking version compatibility updates for ${providerId}...`);
            const config = ProviderDiscoveryEngine.discover(providerId, opts.workspace);
            if (config?.versionSupport) {
                if (config.versionSupport.supported) {
                    logger.log(green(`  ✓ Active version ${config.version} is compatible and up to date.`));
                } else {
                    logger.log(red(`  ✗ Active version ${config.version} is not compatible.`));
                    logger.log(yellow(`    ${config.versionSupport.warning}`));
                }
            } else {
                logger.log("  Provider is not installed.");
            }
            break;
        }

        case "audit": {
            const spinner = new Spinner(`Auditing configuration for ${providerId}...`);
            spinner.start();
            try {
                const schema = ProviderSchemaRegistry.get(providerId);
                if (!schema) {
                    spinner.stop();
                    throw new Error(`Provider "${providerId}" has no registered configuration schema.`);
                }
                const config = ProviderDiscoveryEngine.discover(providerId, opts.workspace);
                const manifest = schema.manifest;
                
                // Read drift
                const lock = ProviderLockRegistry.get(providerId, opts.workspace);
                let configDrifted = false;
                let driftReason = "";
                if (lock) {
                    const drift = ProviderLockRegistry.checkDrift(
                        providerId,
                        config.executable,
                        config.version,
                        lock.configurationFile,
                        opts.workspace
                    );
                    if (drift.drifted) {
                        configDrifted = true;
                        driftReason = drift.reason || "Configuration changed externally.";
                    }
                }
                
                // Read schema validation
                const activePathRes = ProviderConfigurator.getActiveConfigPath(providerId, opts.workspace);
                let schemaError: string | null = null;
                if (fs.existsSync(activePathRes.path)) {
                    const content = fs.readFileSync(activePathRes.path, "utf-8");
                    schemaError = schema.validate(content, activePathRes.path.includes("global"));
                } else {
                    schemaError = "Configuration file missing.";
                }

                // Compatibility checks
                const compatRes = ProviderCompatibilityRegistry.validateCompatibility(manifest.compatibility, config.version);

                spinner.stop();

                if (opts.json) {
                    printJson({
                        ok: !configDrifted && !schemaError && compatRes.supported,
                        configDrifted,
                        driftReason,
                        schemaError,
                        supported: compatRes.supported,
                        version: config.version,
                        minimumVersion: manifest.compatibility.minimumVersion,
                        maximumTestedVersion: manifest.compatibility.maximumTestedVersion
                    });
                    return;
                }

                logger.log(`\nAudit Report: \x1b[1m${providerId}\x1b[0m`);
                logger.log(`─`.repeat(50));
                
                let issues = 0;
                
                if (!config.installed) {
                    logger.log(red(`  ✗ Installation Status: Not installed.`));
                    issues++;
                } else {
                    logger.log(green(`  ✓ Installation Status: Detected version ${config.version}`));
                }

                if (configDrifted) {
                    logger.log(red(`  ✗ Configuration Drift: ${driftReason}`));
                    issues++;
                } else {
                    logger.log(green(`  ✓ Configuration Drift: None detected.`));
                }

                if (schemaError) {
                    logger.log(red(`  ✗ Schema Validation  : Failed. Error: ${schemaError}`));
                    issues++;
                } else {
                    logger.log(green(`  ✓ Schema Validation  : Passed.`));
                }

                if (!compatRes.supported) {
                    logger.log(red(`  ✗ Version Check      : Version is below minimum supported version (${manifest.compatibility.minimumVersion}).`));
                    issues++;
                } else if (compareVersions(config.version, manifest.compatibility.maximumTestedVersion) > 0) {
                    logger.log(yellow(`  ! Version Check      : Warning. Version is newer than latest tested version (${manifest.compatibility.maximumTestedVersion}).`));
                } else {
                    logger.log(green(`  ✓ Version Check      : Version is fully compatible.`));
                }

                logger.log(`─`.repeat(50));
                
                if (issues > 0) {
                    logger.blank();
                    logger.log(bold("Recommended Actions:"));
                    if (!config.installed) {
                        logger.log(`  👉 Install ${providerId} using your system's package manager.`);
                    }
                    if (!compatRes.supported) {
                        const rec = ProviderCompatibilityRegistry.getRecommendation(manifest.compatibility, config.version);
                        logger.log(`  👉 Upgrade Recommended: ${rec}`);
                    } else if (compareVersions(config.version, manifest.compatibility.maximumTestedVersion) > 0) {
                        logger.log(`  👉 Downward Compatibility: Monitor behavior, or downgrade to tested version ${manifest.compatibility.maximumTestedVersion}.`);
                    }
                    if (configDrifted || schemaError || !ProviderConfigurator.isConfigured(providerId, opts.workspace)) {
                        logger.log(`  👉 Repair Configuration: Run ${cyan(`brain provider repair --provider ${providerId}`)} to self-heal configuration file.`);
                    }
                    throw new Error("Audit failed: one or more configuration checks failed.");
                } else {
                    logger.log(green("  ✓ Audit passed. No configuration issues found."));
                }
            } catch (err) {
                spinner.stop();
                throw err;
            }
            break;
        }

        case "health":
        case "benchmark": {
            const list = ProviderSchemaRegistry.list();
            const healthData = list.map(s => {
                const h = ProviderHealthRegistry.get(s.providerId, opts.workspace);
                return {
                    providerId: s.providerId,
                    ...h
                };
            });

            if (opts.json) {
                printJson({ ok: true, health: healthData });
            } else {
                logger.log(bold("\nProvider Health Status:\n"));
                for (const h of healthData) {
                    logger.log(`  - ${bold(h.providerId.padEnd(15))}`);
                    logger.log(`    Last Verification:   ${h.lastSuccessfulVerification || "never"}`);
                    logger.log(`    Last MCP Handshake:  ${h.lastSuccessfulMcpHandshake || "never"}`);
                    logger.log(`    Consecutive Failures: ${h.consecutiveFailures}`);
                }
                logger.blank();
            }
            break;
        }

        default:
            throw new ValidationError(`Unknown provider subcommand: ${sub}`);
    }
}
