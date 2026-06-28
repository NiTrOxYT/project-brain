// ──────────────────────────────────────────────────────────────────────────────
// BUILD-067C — Provider Configurator
// Writes MCP server registration using each provider's OFFICIAL configuration
// schema.  Unknown keys (e.g. legacy mcpServers) are rejected before writing.
//
// OpenCode schema (https://opencode.ai/config.json):
//   mcp.<name>  →  McpLocalConfig  { type: "local", command: string[], enabled?: boolean }
//               →  McpRemoteConfig { type: "remote", url: string,      enabled?: boolean }
//
// Claude Desktop schema:
//   mcpServers.<name>  →  { command: string, args: string[] }
// ──────────────────────────────────────────────────────────────────────────────

import fs   from "fs";
import path from "path";
import os   from "os";

export interface ConfigOptions {
    transport: "stdio" | "http";
    port?:     number;
}

// ─── Per-provider schema descriptors ──────────────────────────────────────────

interface ProviderSchema {
    /** Top-level key that holds MCP server entries. */
    mcpRootKey: string;
    /**
     * Build the MCP server entry object for this provider from options.
     * The returned object must be valid against the provider's official schema.
     */
    buildEntry(opts: ConfigOptions): Record<string, unknown>;
    /**
     * Validate a candidate merged config object.
     * Returns null on success, or a human-readable error string.
     */
    validate(merged: Record<string, unknown>): string | null;
}

/** OpenCode ≥ 0.3 — uses the "mcp" root key with typed local/remote entries. */
const OPENCODE_SCHEMA: ProviderSchema = {
    mcpRootKey: "mcp",

    buildEntry(opts: ConfigOptions): Record<string, unknown> {
        if (opts.transport === "stdio") {
            return {
                type:    "local",
                command: ["brain", "mcp", "stdio"],
                enabled: true,
            };
        }
        const port = opts.port ?? 8765;
        return {
            type:    "remote",
            url:     `http://127.0.0.1:${port}`,
            enabled: true,
        };
    },

    validate(merged: Record<string, unknown>): string | null {
        // OpenCode schema uses additionalProperties: false at the root level,
        // so any key that is NOT in the official Config definition is rejected.
        const KNOWN_ROOT_KEYS = new Set([
            "$schema", "shell", "logLevel", "server", "command", "skills",
            "references", "reference", "watcher", "snapshot", "plugin", "share",
            "autoshare", "autoupdate", "disabled_providers", "enabled_providers",
            "model", "small_model", "default_agent", "username", "mode", "agent",
            "provider", "mcp", "theme", "keybinds", "layout", "attachment",
            "experimental",
        ]);

        const unknown = Object.keys(merged).filter(k => !KNOWN_ROOT_KEYS.has(k));
        if (unknown.length > 0) {
            return `Configuration contains keys not recognised by the OpenCode schema: ${unknown.join(", ")}. ` +
                   `Remove or rename them before Brain can safely write the MCP registration.`;
        }

        // Validate each entry under `mcp` conforms to McpLocalConfig or McpRemoteConfig.
        const mcp = merged.mcp as Record<string, any> | undefined;
        if (mcp && typeof mcp === "object") {
            for (const [name, entry] of Object.entries(mcp)) {
                if (!entry || typeof entry !== "object") {
                    return `mcp.${name} must be an object.`;
                }
                if (entry.type === "local") {
                    if (!Array.isArray(entry.command) || entry.command.length === 0) {
                        return `mcp.${name}: type "local" requires command to be a non-empty string array.`;
                    }
                    // No extra keys allowed (additionalProperties: false)
                    const ALLOWED_LOCAL = new Set(["type", "command", "cwd", "environment", "enabled", "timeout"]);
                    const extras = Object.keys(entry).filter(k => !ALLOWED_LOCAL.has(k));
                    if (extras.length > 0) {
                        return `mcp.${name}: unrecognised fields for local type: ${extras.join(", ")}`;
                    }
                } else if (entry.type === "remote") {
                    if (typeof entry.url !== "string" || !entry.url) {
                        return `mcp.${name}: type "remote" requires a url string.`;
                    }
                    const ALLOWED_REMOTE = new Set(["type", "url", "headers", "oauth", "enabled", "timeout"]);
                    const extras = Object.keys(entry).filter(k => !ALLOWED_REMOTE.has(k));
                    if (extras.length > 0) {
                        return `mcp.${name}: unrecognised fields for remote type: ${extras.join(", ")}`;
                    }
                } else if (entry.enabled !== undefined && Object.keys(entry).length === 1) {
                    // toggle-only object { enabled: boolean } — allowed
                } else {
                    return `mcp.${name}: entry must have type "local" or "remote".`;
                }
            }
        }

        return null; // valid
    },
};

/** Claude Desktop — uses the "mcpServers" root key. */
const CLAUDE_SCHEMA: ProviderSchema = {
    mcpRootKey: "mcpServers",

    buildEntry(opts: ConfigOptions): Record<string, unknown> {
        if (opts.transport === "stdio") {
            return { command: "brain", args: ["mcp", "stdio"] };
        }
        const port = opts.port ?? 8765;
        return { url: `http://127.0.0.1:${port}` };
    },

    validate(_merged: Record<string, unknown>): string | null {
        // Claude Desktop does not publish a strict $schema — accept any object.
        return null;
    },
};

// ─── Schema registry ──────────────────────────────────────────────────────────

const PROVIDER_SCHEMAS: Record<string, ProviderSchema> = {
    opencode: OPENCODE_SCHEMA,
    claude:   CLAUDE_SCHEMA,
};

// ─── ProviderConfigurator ─────────────────────────────────────────────────────

export class ProviderConfigurator {

    static getConfigPath(providerId: string): string {
        const home = os.homedir();
        if (providerId === "opencode") {
            return path.join(home, ".config", "opencode", "opencode.json");
        }
        if (providerId === "claude") {
            return path.join(home, ".config", "Claude", "claude_desktop_config.json");
        }
        return "";
    }

    static isConfigured(providerId: string): boolean {
        const schema = PROVIDER_SCHEMAS[providerId];
        if (!schema) return false;

        const configPath = this.getConfigPath(providerId);
        if (!configPath || !fs.existsSync(configPath)) return false;

        try {
            const data = JSON.parse(fs.readFileSync(configPath, "utf-8"));
            const root = data[schema.mcpRootKey];
            return typeof root === "object" && root !== null && !!root.brain;
        } catch {
            return false;
        }
    }

    static configure(
        providerId: string,
        opts: ConfigOptions,
    ): { success: boolean; error?: string } {
        const schema = PROVIDER_SCHEMAS[providerId];
        if (!schema) {
            return { success: false, error: `Provider "${providerId}" is not supported for MCP configuration.` };
        }

        const configPath = this.getConfigPath(providerId);
        if (!configPath) {
            return { success: false, error: `No configuration path defined for provider "${providerId}".` };
        }

        try {
            // Ensure config directory exists
            const dir = path.dirname(configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Load existing config (tolerate missing or corrupt file)
            let data: Record<string, unknown> = {};
            if (fs.existsSync(configPath)) {
                try {
                    data = JSON.parse(fs.readFileSync(configPath, "utf-8"));
                } catch {
                    // Start with a clean object when file is not valid JSON
                }
            }

            // ── Migrate legacy entries written by old installer versions ────────
            // If a previous installer wrote mcpServers.brain (wrong key), clean it up.
            // We only touch the "brain" sub-key; other mcpServers entries are left alone.
            if (providerId === "opencode" && data.mcpServers && typeof data.mcpServers === "object") {
                const legacy = data.mcpServers as Record<string, unknown>;
                if (legacy.brain) {
                    delete legacy.brain;
                    if (Object.keys(legacy).length === 0) {
                        delete data.mcpServers;
                    }
                }
            }

            // Idempotent merge: inject the Brain entry under the correct root key
            const mcpRoot = (data[schema.mcpRootKey] ?? {}) as Record<string, unknown>;
            const entry   = schema.buildEntry(opts);
            const merged  = { ...data, [schema.mcpRootKey]: { ...mcpRoot, brain: entry } };

            // Validate merged config against the official schema BEFORE writing
            const validationError = schema.validate(merged);
            if (validationError) {
                return { success: false, error: `Schema validation failed: ${validationError}` };
            }

            // Atomic write: write to a temp file then rename to avoid corruption
            const tmpPath = configPath + ".brain.tmp";
            fs.writeFileSync(tmpPath, JSON.stringify(merged, null, 2), "utf-8");
            fs.renameSync(tmpPath, configPath);

            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message ?? "Failed to write configuration file." };
        }
    }

    static unconfigure(providerId: string): { success: boolean; error?: string } {
        const schema = PROVIDER_SCHEMAS[providerId];
        if (!schema) return { success: true };

        const configPath = this.getConfigPath(providerId);
        if (!configPath || !fs.existsSync(configPath)) return { success: true };

        try {
            const data = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, any>;
            const root = data[schema.mcpRootKey];
            if (root && typeof root === "object" && root.brain) {
                delete root.brain;
                if (Object.keys(root).length === 0) {
                    delete data[schema.mcpRootKey];
                } else {
                    data[schema.mcpRootKey] = root;
                }
                fs.writeFileSync(configPath, JSON.stringify(data, null, 2), "utf-8");
            }
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }
}
