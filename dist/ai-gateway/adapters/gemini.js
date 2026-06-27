// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Gemini Adapter
// Transparent wrapper for the Google Gemini CLI.
// Self-registers with AdapterRegistry on module load.
// ──────────────────────────────────────────────────────────────────────────────
import { AdapterRegistry } from "../adapter-registry.js";
import { BaseProviderAdapter } from "./base.js";
class GeminiAdapter extends BaseProviderAdapter {
    id = "gemini";
    displayName = "Gemini (Google)";
    version = "1.0.0";
    binaryName = "gemini";
    buildArgs(opts) {
        return opts.extraArgs;
    }
    metadata() {
        return {
            id: this.id,
            displayName: this.displayName,
            version: this.version,
            capabilities: ["analyze", "create", "modify", "refactor", "document", "validate"],
            supportsStreaming: true,
        };
    }
}
AdapterRegistry.register(new GeminiAdapter());
export { GeminiAdapter };
