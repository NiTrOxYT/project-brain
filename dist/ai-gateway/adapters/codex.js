// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Codex Adapter
// Transparent wrapper for the OpenAI Codex CLI.
// Self-registers with AdapterRegistry on module load.
// ──────────────────────────────────────────────────────────────────────────────
import { AdapterRegistry } from "../adapter-registry.js";
import { BaseProviderAdapter } from "./base.js";
class CodexAdapter extends BaseProviderAdapter {
    id = "codex";
    displayName = "Codex (OpenAI)";
    version = "1.0.0";
    binaryName = "codex";
    buildArgs(opts) {
        return opts.extraArgs;
    }
    metadata() {
        return {
            id: this.id,
            displayName: this.displayName,
            version: this.version,
            capabilities: ["analyze", "create", "modify", "refactor", "validate", "test"],
            supportsStreaming: true,
        };
    }
}
AdapterRegistry.register(new CodexAdapter());
export { CodexAdapter };
