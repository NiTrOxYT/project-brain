import { ProviderDiscoveryEngine } from "./discovery.js";
import { ProviderConfigurator } from "./provider-configurator.js";
import { ProviderPolicyInstaller } from "./provider-policy.js";
import { McpToolRegistry } from "../mcp-server/index.js";
import { ContextProvider } from "../context-provider/provider.js";

export type ProviderState =
    | "Not Installed"
    | "Installed"
    | "MCP Supported"
    | "Configured"
    | "Verified"
    | "Brain Enabled"
    | "Brain Optimized";

export interface VerificationResult {
    level1: boolean;
    level2: boolean;
    level3: boolean;
    state:  ProviderState;
    errors: string[];
}

export class ProviderVerificationEngine {
    static async verify(providerId: string, workspaceRoot: string): Promise<VerificationResult> {
        const errors: string[] = [];
        let level1 = false;
        let level2 = false;
        let level3 = false;
        let state: ProviderState = "Not Installed";

        // Level 1: Registration Verified
        const discovery = ProviderDiscoveryEngine.discover(providerId);
        if (!discovery || discovery.capabilities.launchWrapper === false) {
            state = "Not Installed";
            errors.push(`Provider "${providerId}" installation could not be detected.`);
            return { level1, level2, level3, state, errors };
        }

        state = "Installed";
        if (discovery.capabilities.supportsMcp) {
            state = "MCP Supported";
        }

        const isConfigured = ProviderConfigurator.isConfigured(providerId);
        if (!isConfigured) {
            errors.push(`Brain MCP registration is missing in "${providerId}" configuration.`);
            return { level1, level2, level3, state, errors };
        }

        level1 = true;
        state = "Configured";

        // Level 2: Connectivity Verified
        const requiredTools = [
            "brain.get_context",
            "brain.find_symbol",
            "brain.find_dependencies",
            "brain.search_memory",
            "brain.get_architecture",
            "brain.explain_file"
        ];

        let registeredToolsCount = 0;
        for (const t of requiredTools) {
            if (McpToolRegistry.get(t)) {
                registeredToolsCount++;
            } else {
                errors.push(`Required Brain MCP Tool "${t}" is missing in registry.`);
            }
        }

        if (registeredToolsCount < requiredTools.length) {
            return { level1, level2, level3, state, errors };
        }

        level2 = true;
        state = "Brain Enabled";

        // Level 3: Behavioral Verification
        const policyInstalled = ProviderPolicyInstaller.isPolicyInstalled(providerId);
        const supportsPolicy = providerId === "claude" || providerId === "opencode";

        if (supportsPolicy && !policyInstalled) {
            errors.push("Project instructions policy is not installed.");
        }

        // Execute end-to-end get_context call
        try {
            const tool = McpToolRegistry.get("brain.get_context");
            if (tool) {
                const response = await tool.execute({
                    query: "test verification call",
                    workspaceRoot,
                    snapshotId: "verification-snapshot-id",
                    maxTokens: 1000,
                    openFiles: [],
                    recentlyEditedFiles: []
                });
                
                if (response && response.confidence > 0) {
                    level3 = true;
                    state = "Brain Optimized";

                    // Update ContextProvider telemetry with configuration/connection states
                    const tel = ContextProvider.getTelemetry();
                    tel.mcpConfigured = true;
                    tel.mcpConnected++;
                } else {
                    errors.push("Verification tool call returned invalid confidence response.");
                }
            } else {
                errors.push("Could not locate brain.get_context tool to execute Level 3 check.");
            }
        } catch (err: any) {
            errors.push(`Level 3 execution error: ${err.message || err}`);
        }

        return { level1, level2, level3, state, errors };
    }
}
