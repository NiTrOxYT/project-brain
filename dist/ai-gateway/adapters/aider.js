// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Aider Adapter
// Transparent wrapper for the Aider CLI.
// Self-registers with AdapterRegistry on module load.
// ──────────────────────────────────────────────────────────────────────────────
import { AdapterRegistry } from "../adapter-registry.js";
import { BaseProviderAdapter } from "./base.js";
class AiderAdapter extends BaseProviderAdapter {
    id = "aider";
    displayName = "Aider";
    version = "1.0.0";
    binaryName = "aider";
    buildArgs(opts) {
        return opts.extraArgs;
    }
    metadata() {
        return {
            id: this.id,
            displayName: this.displayName,
            version: this.version,
            capabilities: ["analyze", "create", "modify", "refactor", "validate", "cleanup"],
            supportsStreaming: true,
        };
    }
}
AdapterRegistry.register(new AiderAdapter());
export { AiderAdapter };
