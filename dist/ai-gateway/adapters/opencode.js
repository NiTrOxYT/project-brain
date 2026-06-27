// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — OpenCode Adapter
// Transparent wrapper for the OpenCode CLI.
// Self-registers with AdapterRegistry on module load.
// ──────────────────────────────────────────────────────────────────────────────
import { AdapterRegistry } from "../adapter-registry.js";
import { BaseProviderAdapter } from "./base.js";
class OpenCodeAdapter extends BaseProviderAdapter {
    id = "opencode";
    displayName = "OpenCode";
    version = "1.0.0";
    binaryName = "opencode";
    buildArgs(opts) {
        return opts.extraArgs;
    }
    metadata() {
        return {
            id: this.id,
            displayName: this.displayName,
            version: this.version,
            capabilities: ["analyze", "create", "modify", "refactor", "validate"],
            supportsStreaming: true,
        };
    }
}
AdapterRegistry.register(new OpenCodeAdapter());
export { OpenCodeAdapter };
