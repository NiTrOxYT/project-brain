// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Claude Adapter
// Transparent wrapper for the Anthropic Claude CLI.
// Self-registers with AdapterRegistry on module load.
// ──────────────────────────────────────────────────────────────────────────────

import type { ProviderAdapterMetadata, LaunchOptions } from "../types.js";
import { AdapterRegistry } from "../adapter-registry.js";
import { BaseProviderAdapter } from "./base.js";

class ClaudeAdapter extends BaseProviderAdapter {
    readonly id          = "claude";
    readonly displayName = "Claude (Anthropic)";
    readonly version     = "1.0.0";

    readonly binaryName = "claude";

    protected buildArgs(opts: LaunchOptions): string[] {
        // Pass all user-supplied arguments through unchanged.
        // The optimized prompt is delivered via STDIN or a temp file by the
        // gateway service — adapters only concern themselves with arg routing.
        return opts.extraArgs;
    }

    metadata(): ProviderAdapterMetadata {
        return {
            id:               this.id,
            displayName:      this.displayName,
            version:          this.version,
            capabilities:     ["analyze", "create", "modify", "refactor", "document", "test", "validate"],
            supportsStreaming: true,
        };
    }
}

// Self-register — gateway never references "claude" by name.
AdapterRegistry.register(new ClaudeAdapter());
export { ClaudeAdapter };
