import assert from "assert";
import fs from "fs";
import path from "path";
import { ProviderConfigurator } from "./provider-bridge/provider-configurator.js";
import { ProviderPolicyInstaller } from "./provider-bridge/provider-policy.js";
import { ProviderVerificationEngine } from "./provider-bridge/provider-verifier.js";
import { ContextProvider } from "./context-provider/provider.js";
import "./ai-gateway/adapters/index.js";
import "./mcp-server/index.js";

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

    function cleanConfig() {
        if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
        }
    }

    await test("1. Safe, idempotent MCP configuration writes merge correctly", async () => {
        // Clean start
        cleanConfig();
        await ProviderConfigurator.unconfigure(providerId);
        assert(ProviderConfigurator.isConfigured(providerId) === false);

        // Configure stdio transport
        const res = await ProviderConfigurator.configure(providerId, { transport: "stdio" });
        assert.strictEqual(res.success, true, res.error);
        assert(ProviderConfigurator.isConfigured(providerId) === true);

        // Verify formatting and keys exist
        const data = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        // OpenCode schema has mcp.brain, not mcpServers.brain
        assert(data.mcp !== undefined);
        assert(data.mcp.brain !== undefined);
        assert(data.mcp.brain.type === "local");
        assert(data.mcp.brain.command[0] === "brain");

        // Idempotent merge check (running again shouldn't modify unrelated configs)
        data.model = "anthropic/claude-sonnet-4-5";
        fs.writeFileSync(configPath, JSON.stringify(data, null, 2), "utf-8");

        const res2 = await ProviderConfigurator.configure(providerId, { transport: "stdio" });
        assert(res2.success === true, res2.error);
        const data2 = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        assert(data2.model === "anthropic/claude-sonnet-4-5", "Unrelated settings must be preserved");

        // Unconfigure
        await ProviderConfigurator.unconfigure(providerId);
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
        const testWorkspace = "packages/context-retrieval";
        const testConfigPath = path.join(testWorkspace, ".opencode", "opencode.json");
        if (fs.existsSync(testConfigPath)) {
            fs.unlinkSync(testConfigPath);
        }
        ContextProvider.clearTelemetry();
        await ProviderConfigurator.unconfigure(providerId, testWorkspace);
        ProviderPolicyInstaller.removePolicy(providerId);

        // Verify Level 1 failure when not configured (will set state to "Installed" because provider binary is installed)
        const res1 = await ProviderVerificationEngine.verify(providerId, testWorkspace);
        assert(res1.level1 === true); // Wait, is Level 1 (Installation) verified? Yes, because opencode binary exists!
        assert(res1.level2 === false); // Level 2 (Configuration) is false
        assert(res1.state === "Installed");

        // Configure provider in workspace
        await ProviderConfigurator.configure(providerId, { transport: "stdio" }, testWorkspace);
        ProviderPolicyInstaller.installPolicy(providerId);

        // Verify Level 3 transition to Brain Optimized
        const res3 = await ProviderVerificationEngine.verify(providerId, testWorkspace);
        assert(res3.level1 === true, "Level 1 should be verified");
        assert(res3.level2 === true, "Level 2 should be verified");
        assert(res3.level3 === true, `Level 3 should be verified end-to-end. Errors: ${JSON.stringify(res3.errors)}`);
        assert(res3.state === "Brain Optimized");

        // Verify context provider telemetry records configuration connection count
        const tel = ContextProvider.getTelemetry();
        assert(tel.mcpConfigured === true);
        assert(tel.mcpConnected >= 1);

        // Cleanup
        await ProviderConfigurator.unconfigure(providerId, testWorkspace);
        if (fs.existsSync(testConfigPath)) {
            fs.unlinkSync(testConfigPath);
        }
        ProviderPolicyInstaller.removePolicy(providerId);
    });

    console.log("\nAll BUILD-067 tests passed successfully!");
}

runTests();
