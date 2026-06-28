import assert from "assert";
import fs from "fs";
import { ProviderConfigurator } from "./provider-bridge/provider-configurator.js";
import { ProviderPolicyInstaller } from "./provider-bridge/provider-policy.js";
import { ProviderVerificationEngine } from "./provider-bridge/provider-verifier.js";
import { ContextProvider } from "./context-provider/provider.js";

// Helper to run a test block and report outcomes
async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
    try {
        await fn();
        console.log(`✓ ${name}`);
    } catch (err: any) {
        console.error(`✗ ${name}`);
        console.error(err.stack || err);
        process.exit(1);
    }
}

async function runTests() {
    console.log("Starting BUILD-067 Automatic Provider MCP Registration & Verification Test Suite...\n");

    const providerId = "opencode";
    const configPath = ProviderConfigurator.getConfigPath(providerId);
    const policyPath = ProviderPolicyInstaller.getInstructionsPath(providerId);

    await test("1. Safe, idempotent MCP configuration writes merge correctly", () => {
        // Clean start
        ProviderConfigurator.unconfigure(providerId);
        assert(ProviderConfigurator.isConfigured(providerId) === false);

        // Configure stdio transport
        const res = ProviderConfigurator.configure(providerId, { transport: "stdio" });
        assert(res.success === true);
        assert(ProviderConfigurator.isConfigured(providerId) === true);

        // Verify formatting and keys exist
        const data = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        assert(data.mcpServers.brain !== undefined);
        assert(data.mcpServers.brain.command === "brain");
        assert(data.mcpServers.brain.args[0] === "mcp");
        assert(data.mcpServers.brain.args[1] === "stdio");

        // Idempotent merge check (running again shouldn't modify unrelated configs)
        data.otherKey = "keep-me";
        fs.writeFileSync(configPath, JSON.stringify(data, null, 2), "utf-8");

        const res2 = ProviderConfigurator.configure(providerId, { transport: "stdio" });
        assert(res2.success === true);
        const data2 = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        assert(data2.otherKey === "keep-me", "Unrelated settings must be preserved");

        // Unconfigure
        ProviderConfigurator.unconfigure(providerId);
        assert(ProviderConfigurator.isConfigured(providerId) === false);
    });

    await test("2. Policy Installer creates project policy text correctly", () => {
        ProviderPolicyInstaller.removePolicy(providerId);
        assert(ProviderPolicyInstaller.isPolicyInstalled(providerId) === false);

        const res = ProviderPolicyInstaller.installPolicy(providerId);
        assert(res.success === true);
        assert(ProviderPolicyInstaller.isPolicyInstalled(providerId) === true);

        const policyText = fs.readFileSync(policyPath, "utf-8");
        assert(policyText.includes("Project Brain is the authoritative source"));

        // Cleanup
        ProviderPolicyInstaller.removePolicy(providerId);
    });

    await test("3. ProviderVerificationEngine executes Level 1, 2, and 3 verification checks", async () => {
        ContextProvider.clearTelemetry();
        ProviderConfigurator.unconfigure(providerId);
        ProviderPolicyInstaller.removePolicy(providerId);

        // Verify Level 1 failure when not configured
        const res1 = await ProviderVerificationEngine.verify(providerId, "packages/context-retrieval");
        assert(res1.level1 === false);
        assert(res1.state === "MCP Supported");

        // Configure provider
        ProviderConfigurator.configure(providerId, { transport: "stdio" });
        ProviderPolicyInstaller.installPolicy(providerId);

        // Verify Level 3 transition to Brain Optimized
        const res3 = await ProviderVerificationEngine.verify(providerId, "packages/context-retrieval");
        assert(res3.level1 === true, "Level 1 should be verified");
        assert(res3.level2 === true, "Level 2 should be verified");
        assert(res3.level3 === true, "Level 3 should be verified end-to-end");
        assert(res3.state === "Brain Optimized");

        // Verify context provider telemetry records configuration connection count
        const tel = ContextProvider.getTelemetry();
        assert(tel.mcpConfigured === true);
        assert(tel.mcpConnected >= 1);

        // Cleanup
        ProviderConfigurator.unconfigure(providerId);
        ProviderPolicyInstaller.removePolicy(providerId);
    });

    console.log("\nAll BUILD-067 tests passed successfully!");
}

runTests();
