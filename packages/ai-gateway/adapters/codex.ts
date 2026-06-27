// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Codex Adapter
// Transparent wrapper for the OpenAI Codex CLI.
// Self-registers with AdapterRegistry on module load.
// ──────────────────────────────────────────────────────────────────────────────

import type { ProviderAdapterMetadata, LaunchOptions } from "../types.js";
import { AdapterRegistry } from "../adapter-registry.js";
import { BaseProviderAdapter } from "./base.js";

class CodexAdapter extends BaseProviderAdapter {
    readonly id          = "codex";
    readonly displayName = "Codex (OpenAI)";
    readonly version     = "1.0.0";

    readonly binaryName = "codex";

    protected buildArgs(opts: LaunchOptions): string[] {
        return opts.extraArgs;
    }

    metadata(): ProviderAdapterMetadata {
        return {
            id:               this.id,
            displayName:      this.displayName,
            version:          this.version,
            capabilities:     ["analyze", "create", "modify", "refactor", "validate", "test"],
            supportsStreaming: true,
        };
    }
}

AdapterRegistry.register(new CodexAdapter());
export { CodexAdapter };
