// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Aider Adapter
// Transparent wrapper for the Aider CLI.
// Self-registers with AdapterRegistry on module load.
// ──────────────────────────────────────────────────────────────────────────────

import type { ProviderAdapterMetadata, LaunchOptions } from "../types.js";
import { AdapterRegistry } from "../adapter-registry.js";
import { BaseProviderAdapter } from "./base.js";

class AiderAdapter extends BaseProviderAdapter {
    readonly id          = "aider";
    readonly displayName = "Aider";
    readonly version     = "1.0.0";

    readonly binaryName = "aider";

    protected buildArgs(opts: LaunchOptions): string[] {
        return opts.extraArgs;
    }

    metadata(): ProviderAdapterMetadata {
        return {
            id:               this.id,
            displayName:      this.displayName,
            version:          this.version,
            capabilities:     ["analyze", "create", "modify", "refactor", "validate", "cleanup"],
            supportsStreaming: true,
        };
    }
}

AdapterRegistry.register(new AiderAdapter());
export { AiderAdapter };
