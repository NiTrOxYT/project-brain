import assert from "assert";
import { ProviderDiscoveryEngine } from "./provider-bridge/discovery.js";
import { ProviderSessionInitializer } from "./provider-bridge/session-instructions.js";
import { ContextProvider } from "./context-provider/provider.js";
import type { ContextRequest } from "./context-provider/types.js";
import "./ai-gateway/adapters/index.js";

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
    console.log("Starting BUILD-066 Official Provider MCP Integration Test Suite...\n");

    await test("1. Provider Discovery Engine detects capability options correctly", () => {
        // Claude discovery has MCP capability active
        const claude = ProviderDiscoveryEngine.discover("claude");
        assert(claude.providerId === "claude");
        assert(claude.capabilities.supportsMcp === true);
        assert(claude.capabilities.supportsToolCalling === true);
        assert(claude.capabilities.supportsSdk === false);

        // Aider discovery does not support MCP configuration writes
        const aider = ProviderDiscoveryEngine.discover("aider");
        assert(aider.capabilities.supportsMcp === false);
        assert(aider.capabilities.supportsToolCalling === false);
    });

    await test("2. ProviderSessionInitializer returns Brain Context Consumption policy using official instructions config", () => {
        const claudeSession = ProviderSessionInitializer.initializeSession("claude");
        assert(claudeSession.success === true);
        assert(claudeSession.instructions?.includes("Project Brain Context Consumption Policy"));
        assert(claudeSession.instructions?.includes("brain.get_context"));

        // Aider does not support official startup instructions configuration, so returns false (no injection)
        const aiderSession = ProviderSessionInitializer.initializeSession("aider");
        assert(aiderSession.success === false);
        assert(aiderSession.instructions === undefined);
    });

    await test("3. Provider tool verification registers actual MCP tool calls and updates Brain Enabled state", async () => {
        ContextProvider.clearTelemetry();
        const provider = new ContextProvider("packages/context-retrieval", "packages/context-retrieval");

        const req: ContextRequest = {
            providerId:          "claude",
            query:               "test configuration files",
            workspaceRoot:       "packages/context-retrieval",
            snapshotId:          "snap-a1b2c3d4",
            maxTokens:           4000,
            openFiles:           [],
            recentlyEditedFiles: []
        };

        // Initially zero calls
        let tel = ContextProvider.getTelemetry();
        assert(tel.brainContextRequested === 0);

        // Query context
        await provider.getContext(req);

        // Verify metrics
        tel = ContextProvider.getTelemetry();
        assert(tel.brainContextRequested === 1, "Should increment context requests");
        assert(tel.brainToolUsed === 1, "Should increment tool invocations");
        assert(tel.repoSearchAvoided === 1, "Should record repository search avoided count");
        assert(tel.promptTokensSaved > 0, "Should compute token savings from actual call");
    });

    console.log("\nAll BUILD-066 tests passed successfully!");
}

runTests();
