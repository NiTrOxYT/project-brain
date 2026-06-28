import assert from "assert";
import fs from "fs";
import { runInstall } from "./cli/commands/install.js";
import { ProviderConfigurator } from "./provider-bridge/provider-configurator.js";
import { ProviderPolicyInstaller } from "./provider-bridge/provider-policy.js";
import { ProviderRuntimeService } from "./provider-runtime/service.js";
// Helper to run a test block and report outcomes
async function test(name, fn) {
    try {
        await fn();
        console.log(`✓ ${name}`);
    }
    catch (err) {
        console.error(`✗ ${name}`);
        console.error(err.stack || err);
        process.exit(1);
    }
}
async function runTests() {
    console.log("Starting BUILD-067B Fix Provider Installation Pipeline Test Suite...\n");
    const providerId = "opencode";
    const configPath = ProviderConfigurator.getConfigPath(providerId);
    const policyPath = ProviderPolicyInstaller.getInstructionsPath(providerId);
    await test("1. Zero-touch installation configures OpenCode, creates policy, updates registry", async () => {
        // Clean start
        ProviderConfigurator.unconfigure(providerId);
        ProviderPolicyInstaller.removePolicy(providerId);
        assert(ProviderConfigurator.isConfigured(providerId) === false);
        assert(ProviderPolicyInstaller.isPolicyInstalled(providerId) === false);
        // Run install command programmatically
        const globalOpts = {
            workspace: process.cwd(),
            project: process.cwd(),
            json: false,
            verbose: false,
            quiet: true
        };
        // We run install with opencode providerId to target only OpenCode configuration
        await runInstall(globalOpts, {
            providerId,
            repair: false,
            uninstall: false,
            dryRun: false
        });
        // 1. Verify MCP configuration written safely
        assert(ProviderConfigurator.isConfigured(providerId) === true, "OpenCode must be marked configured");
        const configData = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        assert(configData.mcp.brain !== undefined, "Brain MCP registration must exist");
        assert(configData.mcp.brain.command[0] === "brain");
        // 2. Verify policy instructions file created
        assert(ProviderPolicyInstaller.isPolicyInstalled(providerId) === true, "Context policy file must be installed");
        const policyText = fs.readFileSync(policyPath, "utf-8");
        assert(policyText.includes("Project Brain is the authoritative source"), "Policy file content must match");
        // 3. Verify registry reflects the installed provider
        const runtimeSvc = new ProviderRuntimeService(process.cwd());
        // Yield to allow dynamic imports in constructor to complete
        await new Promise(r => setTimeout(r, 100));
        const diag = runtimeSvc.diagnostics();
        assert(diag.totalProviders >= 1, "Should count at least 1 provider");
        assert(diag.registeredProviderIds.includes(providerId), "opencode must be in registered IDs list");
        // Cleanup
        ProviderConfigurator.unconfigure(providerId);
        ProviderPolicyInstaller.removePolicy(providerId);
    });
    console.log("\nAll BUILD-067B tests passed successfully!");
}
runTests();
