// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Gemini Adapter
// Transparent wrapper for the Google Gemini CLI.
// Self-registers with AdapterRegistry on module load.
// ──────────────────────────────────────────────────────────────────────────────

import type { ProviderAdapterMetadata, LaunchOptions } from "../types.js";
import { AdapterRegistry } from "../adapter-registry.js";
import { BaseProviderAdapter } from "./base.js";

class GeminiAdapter extends BaseProviderAdapter {
    readonly id          = "gemini";
    readonly displayName = "Gemini (Google)";
    readonly version     = "1.0.0";

    readonly binaryName = "gemini";

    protected buildArgs(opts: LaunchOptions): string[] {
        return opts.extraArgs;
    }

    metadata(): ProviderAdapterMetadata {
        return {
            id:               this.id,
            displayName:      this.displayName,
            version:          this.version,
            capabilities:     ["analyze", "create", "modify", "refactor", "document", "validate"],
            supportsStreaming: true,
        };
    }
}

AdapterRegistry.register(new GeminiAdapter());
export { GeminiAdapter };
