// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — config command
// brain config <subcommand>
// ──────────────────────────────────────────────────────────────────────────────

import { GlobalOptions } from "../main.js";
import { logger } from "../utils/logger.js";
import { printJson } from "../utils/json.js";
import { requireBrainInitialized, loadConfig, saveConfig } from "../utils/paths.js";
import { ValidationError } from "../utils/errors.js";
import { bold } from "../utils/colors.js";

type ConfigSubcmd = "show" | "set" | "reset";

const DEFAULT_CONFIG: Record<string, unknown> = {
    version: "1",
    providers: {},
    compiler: {
        incremental: true,
        maxFileSize: 512000,
    },
    retrieval: {
        defaultBudget: 8000,
        strategy: "hybrid",
    },
    learning: {
        enabled: true,
    },
};

export async function runConfig(
    opts: GlobalOptions,
    sub: ConfigSubcmd,
    cmdOpts: Record<string, unknown>
): Promise<void> {
    requireBrainInitialized(opts.workspace);

    switch (sub) {
        case "show": {
            const config = loadConfig(opts.workspace);
            if (opts.json) {
                printJson({ ok: true, config });
            } else {
                logger.log(bold("brain config"));
                logger.log(JSON.stringify(config, null, 2));
            }
            break;
        }

        case "set": {
            const key   = cmdOpts["key"]   as string | undefined;
            const value = cmdOpts["value"] as string | undefined;
            if (!key)   throw new ValidationError("Usage: brain config set --key <key> --value <value>");
            if (!value) throw new ValidationError("Usage: brain config set --key <key> --value <value>");

            const config = loadConfig(opts.workspace);
            // Support dot-notation keys: compiler.incremental
            const parts = key.split(".");
            let node: any = config;
            for (let i = 0; i < parts.length - 1; i++) {
                if (typeof node[parts[i]] !== "object") node[parts[i]] = {};
                node = node[parts[i]];
            }

            // Parse as JSON if possible
            let parsed: unknown = value;
            try { parsed = JSON.parse(value); } catch { /* keep string */ }
            node[parts[parts.length - 1]] = parsed;

            saveConfig(opts.workspace, config);

            if (opts.json) {
                printJson({ ok: true, key, value: parsed });
            } else {
                logger.log(`\x1b[32m✔\x1b[0m Set ${key} = ${JSON.stringify(parsed)}`);
            }
            break;
        }

        case "reset": {
            const config = loadConfig(opts.workspace);
            const merged = { ...DEFAULT_CONFIG, ...config, ...DEFAULT_CONFIG };
            saveConfig(opts.workspace, merged);

            if (opts.json) {
                printJson({ ok: true, config: merged });
            } else {
                logger.log(`\x1b[32m✔\x1b[0m Config reset to defaults`);
            }
            break;
        }

        default: throw new ValidationError(`Unknown config subcommand: ${sub}`);
    }
}
