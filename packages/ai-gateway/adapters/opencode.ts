// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — OpenCode Adapter
// Transparent wrapper for the OpenCode CLI.
// Self-registers with AdapterRegistry on module load.
// ──────────────────────────────────────────────────────────────────────────────

import type { ProviderAdapterMetadata, LaunchOptions } from "../types.js";
import { AdapterRegistry } from "../adapter-registry.js";
import { BaseProviderAdapter } from "./base.js";

class OpenCodeAdapter extends BaseProviderAdapter {
    readonly id          = "opencode";
    readonly displayName = "OpenCode";
    readonly version     = "1.0.0";

    readonly binaryName = "opencode";

    protected buildArgs(opts: LaunchOptions): string[] {
        return opts.extraArgs;
    }

    metadata(): ProviderAdapterMetadata {
        return {
            id:               this.id,
            displayName:      this.displayName,
            version:          this.version,
            capabilities:     ["analyze", "create", "modify", "refactor", "validate"],
            supportsStreaming: true,
        };
    }
}

AdapterRegistry.register(new OpenCodeAdapter());
export { OpenCodeAdapter };
