// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Ollama Adapter
// Transparent wrapper for Ollama.
// Detection: `ollama` binary OR port 11434 TCP check.
// Self-registers with AdapterRegistry on module load.
// ──────────────────────────────────────────────────────────────────────────────

import net  from "net";
import type { ProviderAdapterMetadata, ProviderHealthStatus, LaunchOptions } from "../types.js";
import { AdapterRegistry } from "../adapter-registry.js";
import { BaseProviderAdapter } from "./base.js";

const OLLAMA_DEFAULT_PORT = 11434;
const OLLAMA_DEFAULT_HOST = "127.0.0.1";

class OllamaAdapter extends BaseProviderAdapter {
    readonly id          = "ollama";
    readonly displayName = "Ollama";
    readonly version     = "1.0.0";

    readonly binaryName = "ollama";

    protected buildArgs(opts: LaunchOptions): string[] {
        return opts.extraArgs;
    }

    /**
     * Ollama is detected if the binary is in PATH OR if the local server
     * is listening on port 11434.
     */
    override async detect(): Promise<boolean> {
        // Try binary first (base implementation).
        try {
            await this.resolvedBinaryPath();
            return true;
        } catch {
            // Fall back to port check — Ollama may be running as a service.
            return await this.isPortOpen(OLLAMA_DEFAULT_HOST, OLLAMA_DEFAULT_PORT);
        }
    }

    /**
     * Health check: prefer binary health if binary present,
     * otherwise test TCP connectivity.
     */
    override async health(): Promise<ProviderHealthStatus> {
        try {
            // Try binary path — will throw WrapperLoopError or ProviderDetectionError if missing.
            await this.resolvedBinaryPath();
            return "healthy";
        } catch {
            // Binary not found — check port.
            const portOpen = await this.isPortOpen(OLLAMA_DEFAULT_HOST, OLLAMA_DEFAULT_PORT);
            return portOpen ? "degraded" : "offline";
        }
    }

    metadata(): ProviderAdapterMetadata {
        return {
            id:               this.id,
            displayName:      this.displayName,
            version:          this.version,
            capabilities:     ["analyze", "create", "modify", "refactor"],
            supportsStreaming: true,
        };
    }

    // ── Port probe ────────────────────────────────────────────────────────────

    private isPortOpen(host: string, port: number): Promise<boolean> {
        return new Promise(resolve => {
            const socket = new net.Socket();
            const cleanup = (result: boolean): void => {
                socket.destroy();
                resolve(result);
            };
            socket.setTimeout(1500);
            socket.once("connect", () => cleanup(true));
            socket.once("error",   () => cleanup(false));
            socket.once("timeout", () => cleanup(false));
            socket.connect(port, host);
        });
    }
}

AdapterRegistry.register(new OllamaAdapter());
export { OllamaAdapter };
