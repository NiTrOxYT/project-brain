// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Claude Adapter
// Transparent wrapper for the Anthropic Claude CLI.
// Self-registers with AdapterRegistry on module load.
// ──────────────────────────────────────────────────────────────────────────────
import { AdapterRegistry } from "../adapter-registry.js";
import { BaseProviderAdapter } from "./base.js";
class ClaudeAdapter extends BaseProviderAdapter {
    id = "claude";
    displayName = "Claude (Anthropic)";
    version = "1.0.0";
    binaryName = "claude";
    buildArgs(opts) {
        // Pass all user-supplied arguments through unchanged.
        // The optimized prompt is delivered via STDIN or a temp file by the
        // gateway service — adapters only concern themselves with arg routing.
        return opts.extraArgs;
    }
    metadata() {
        return {
            id: this.id,
            displayName: this.displayName,
            version: this.version,
            capabilities: ["analyze", "create", "modify", "refactor", "document", "test", "validate"],
            supportsStreaming: true,
        };
    }
}
// Self-register — gateway never references "claude" by name.
AdapterRegistry.register(new ClaudeAdapter());
export { ClaudeAdapter };
