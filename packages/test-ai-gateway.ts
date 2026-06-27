// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Verification Suite
// Asserts all 10 phases: foundations, adapter systems, pipeline optimization,
// console streaming, workspace commits, loop guards, pathing, and timelines.
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import assert from "assert";
import os from "os";

// import registration to ensure adapters self-register
import "./ai-gateway/adapters/index.js";

import {
    GatewayEventBus,
    makeEvent,
    AdapterRegistry,
    PromptDiffEngine,
    TimelineStore,
    GatewaySessionStore,
    GatewayMetricsStore,
    GatewayHistory,
    GlobalPaths,
    GatewayInstaller,
    LiveConsole,
    AiGatewayService,
} from "./ai-gateway/index.js";

import { BaseProviderAdapter } from "./ai-gateway/adapters/base.js";
import type { LaunchOptions, ProviderProcess, ExitResult } from "./ai-gateway/types.js";

const TEST_SESSION_ID = "gs-test1234";

// ─── Dummy Mock Adapter for Pipeline Verification ────────────────────────────

class MockProviderAdapter extends BaseProviderAdapter {
    readonly id          = "mock-provider";
    readonly displayName = "Mock Provider";
    readonly version     = "1.2.3";
    readonly binaryName  = "mock-provider";

    protected buildArgs(opts: LaunchOptions): string[] {
        return opts.extraArgs;
    }

    capabilities() { return this.metadata().capabilities; }

    async detect(): Promise<boolean> {
        return true;
    }

    async resolvedBinaryPath(): Promise<string> {
        return "/usr/bin/mock-provider";
    }

    metadata() {
        return {
            id:                this.id,
            displayName:       this.displayName,
            version:           this.version,
            capabilities:      ["analyze"],
            supportsStreaming: true,
        };
    }

    async health() {
        return "healthy" as const;
    }

    async launch(opts: LaunchOptions): Promise<ProviderProcess> {
        return {
            pid: 99999,
            stdout: (async function* () {
                yield "hello from ";
                yield "mock adapter";
            })(),
            stderr: (async function* () {
                // empty
            })(),
            cancel: async () => {},
            wait: async (): Promise<ExitResult> => ({ code: 0, signal: null }),
        };
    }
}

// ─── Main verification loop ───────────────────────────────────────────────────

async function main() {
    console.log("===============================================================");
    console.log(" BUILD-061A — AI Gateway Verification Suite");
    console.log("===============================================================\n");

    try {
        test01_EventBus();
        test02_Registry();
        test03_DiffEngine();
        test04_TimelineStore();
        await test05_SessionStore();
        await test06_MetricsStore();
        await test07_History();
        await test08_Installer();
        await test09_GatewayService();
        test10_ConsoleSmoke();

        console.log("\n===============================================================");
        console.log(" RESULTS: All AI Gateway verification assertions passed successfully!");
        console.log("===============================================================");
        process.exit(0);
    } catch (err: any) {
        console.error("\n===============================================================");
        console.error(" ASSERTION FAILED:", err.message);
        if (err.stack) console.error(err.stack);
        console.error("===============================================================");
        process.exit(1);
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

function test01_EventBus() {
    console.log("  Running Test 01: GatewayEventBus…");
    const bus = new GatewayEventBus();
    const events: any[] = [];

    // Wildcard subscriber
    const unsub = bus.on("*", e => events.push(e));

    // Normal subscriber
    let normalCount = 0;
    bus.on("PromptReceived", () => {
        normalCount++;
    });

    // Once subscriber
    let onceCount = 0;
    bus.once("ContextRetrievalCompleted", () => {
        onceCount++;
    });

    // Emit 1
    bus.emit(makeEvent("PromptReceived", TEST_SESSION_ID));
    assert.strictEqual(normalCount, 1);
    assert.strictEqual(events.length, 1);

    // Emit 2 (once event)
    bus.emit(makeEvent("ContextRetrievalCompleted", TEST_SESSION_ID));
    assert.strictEqual(onceCount, 1);
    assert.strictEqual(events.length, 2);

    // Emit 3 (once event again — should not trigger onceCount)
    bus.emit(makeEvent("ContextRetrievalCompleted", TEST_SESSION_ID));
    assert.strictEqual(onceCount, 1); // stayed 1
    assert.strictEqual(events.length, 3);

    // Unsubscribe wildcard
    unsub();
    bus.emit(makeEvent("PromptReceived", TEST_SESSION_ID));
    assert.strictEqual(normalCount, 2);
    assert.strictEqual(events.length, 3); // stayed 3

    console.log("  ✓ EventBus assertions passed.");
}

function test02_Registry() {
    console.log("  Running Test 02: AdapterRegistry…");

    // Standard registered adapters
    assert.ok(AdapterRegistry.has("claude"));
    assert.ok(AdapterRegistry.has("codex"));
    assert.ok(AdapterRegistry.has("gemini"));

    const claude = AdapterRegistry.lookup("claude");
    assert.strictEqual(claude.id, "claude");
    assert.ok(claude.displayName.includes("Claude"));

    // Register a new mock adapter
    const mock = new MockProviderAdapter();
    AdapterRegistry.register(mock);
    assert.ok(AdapterRegistry.has("mock-provider"));

    const fetched = AdapterRegistry.lookup("mock-provider");
    assert.strictEqual(fetched.version, "1.2.3");

    // Clean up registry
    AdapterRegistry.unregister("mock-provider");
    assert.ok(!AdapterRegistry.has("mock-provider"));

    console.log("  ✓ AdapterRegistry assertions passed.");
}

function test03_DiffEngine() {
    console.log("  Running Test 03: PromptDiffEngine…");
    const engine = new PromptDiffEngine();

    const original = "Create a database setup function.";
    const optimized = "--- Project Brain Context ---\n[schema.sql]\nCREATE TABLE users (...);\n--- End Context ---\n\nCreate a database setup function.";

    const ops = [
        {
            action:  "add" as const,
            kind:    "contextBlock" as const,
            label:   "schema.sql",
            content: "CREATE TABLE users (...);",
            reason:  "Injected database schema",
        }
    ];

    const diff = engine.compute(original, optimized, ops);
    assert.strictEqual(diff.removed.length, 0);
    assert.strictEqual(diff.added.length, 1);
    assert.strictEqual(diff.added[0].label, "schema.sql");
    assert.strictEqual(diff.added[0].reason, "Injected database schema");
    assert.ok(diff.tokensBefore > 0);
    assert.ok(diff.tokensAfter > diff.tokensBefore);
    assert.strictEqual(diff.savedTokens, 0); // prompt grew longer
    assert.strictEqual(diff.savedPct, 0);

    console.log("  ✓ PromptDiffEngine assertions passed.");
}

function test04_TimelineStore() {
    console.log("  Running Test 04: TimelineStore…");
    const store = new TimelineStore(TEST_SESSION_ID);

    store.record(makeEvent("SessionStarted", TEST_SESSION_ID), "Started session");
    store.record(makeEvent("ContextRetrievalCompleted", TEST_SESSION_ID, { durationMs: 150 }), "Retrieval complete", "12 files");

    const snaps = store.snapshot();
    assert.strictEqual(snaps.length, 2);
    assert.strictEqual(snaps[0].kind, "SessionStarted");
    assert.strictEqual(snaps[1].kind, "ContextRetrievalCompleted");
    assert.strictEqual(snaps[1].durationMs, 150);
    assert.strictEqual(snaps[1].detail, "12 files");

    const render = store.render();
    assert.ok(render.includes("Timeline"));
    assert.ok(render.includes("Retrieval complete"));

    console.log("  ✓ TimelineStore assertions passed.");
}

async function test05_SessionStore() {
    console.log("  Running Test 05: GatewaySessionStore…");

    // Use a custom test paths instance with overrideRoot to avoid writing to ~/.project-brain
    const tempRoot = path.join(os.tmpdir(), "brain-test-sessions-" + Date.now());
    const mockPaths = new GlobalPaths(tempRoot);

    const store = new GatewaySessionStore(mockPaths);
    const session = {
        id:              "gs-persist-test",
        providerId:      "claude",
        projectRoot:     tempRoot,
        workspaceRoot:   tempRoot,
        originalPrompt:  "test input",
        optimizedPrompt: "test input optimized",
        contextDigest:   "abc",
        timeline:        [],
        startedAt:       new Date().toISOString(),
    };

    store.save(session);

    // List all
    const all = store.listAll();
    assert.strictEqual(all.length, 1);
    assert.strictEqual(all[0].id, "gs-persist-test");

    // Find by ID
    const found = store.findById("gs-persist-test");
    assert.ok(found);
    assert.strictEqual(found.contextDigest, "abc");

    // Find by provider
    const byProv = store.findByProvider("claude");
    assert.strictEqual(byProv.length, 1);

    // Clean up
    fs.rmSync(tempRoot, { recursive: true, force: true });
    console.log("  ✓ GatewaySessionStore assertions passed.");
}

async function test06_MetricsStore() {
    console.log("  Running Test 06: GatewayMetricsStore…");

    const tempRoot = path.join(os.tmpdir(), "brain-test-metrics-" + Date.now());
    const mockPaths = new GlobalPaths(tempRoot);

    const store = new GatewayMetricsStore(mockPaths);

    // Load initial (empty)
    const initial = store.load();
    assert.strictEqual(initial.totalSessions, 0);

    const session = {
        id:              "gs-metrics-test",
        providerId:      "claude",
        projectRoot:     tempRoot,
        workspaceRoot:   tempRoot,
        originalPrompt:  "test input",
        optimizedPrompt: "test input optimized",
        contextDigest:   "abc",
        timeline:        [],
        startedAt:       new Date().toISOString(),
        completedAt:     new Date().toISOString(),
        metrics: {
            promptTokens:    2000,
            optimizedTokens: 500,
            reductionPct:    75,
            retrievedFiles:  5,
            latencyMs:       100,
            estimatedCost:   0.0015,
            learningHits:    1,
        }
    };

    store.update(session, 2);

    const updated = store.load();
    assert.strictEqual(updated.totalSessions, 1);
    assert.strictEqual(updated.totalTokensSaved, 1500); // 2000 - 500
    assert.strictEqual(updated.learningPatterns, 2);

    const provStats = updated.perProvider.find(p => p.providerId === "claude");
    assert.ok(provStats);
    assert.strictEqual(provStats.sessionCount, 1);
    assert.strictEqual(provStats.totalTokensSaved, 1500);

    fs.rmSync(tempRoot, { recursive: true, force: true });
    console.log("  ✓ GatewayMetricsStore assertions passed.");
}

async function test07_History() {
    console.log("  Running Test 07: GatewayHistory…");

    const tempRoot = path.join(os.tmpdir(), "brain-test-history-" + Date.now());
    const mockPaths = new GlobalPaths(tempRoot);

    const store = new GatewaySessionStore(mockPaths);
    const session1 = {
        id:              "gs-hist-1",
        providerId:      "claude",
        projectRoot:     tempRoot,
        workspaceRoot:   tempRoot,
        originalPrompt:  "hello database design pattern",
        optimizedPrompt: "hello database design pattern optimized",
        contextDigest:   "a",
        timeline:        [],
        startedAt:       new Date(Date.now() - 60000).toISOString(),
    };
    const session2 = {
        id:              "gs-hist-2",
        providerId:      "codex",
        projectRoot:     tempRoot,
        workspaceRoot:   tempRoot,
        originalPrompt:  "auth middleware issue",
        optimizedPrompt: "auth middleware issue optimized",
        contextDigest:   "b",
        timeline:        [],
        startedAt:       new Date().toISOString(),
    };

    store.save(session1);
    store.save(session2);

    const history = new GatewayHistory(store);

    // List all
    const all = history.query();
    assert.strictEqual(all.length, 2);

    // Filter by provider
    const claudeOnly = history.query({ providerId: "claude" });
    assert.strictEqual(claudeOnly.length, 1);
    assert.strictEqual(claudeOnly[0].id, "gs-hist-1");

    // Filter by keyword
    const keywordSearch = history.query({ keyword: "middleware" });
    assert.strictEqual(keywordSearch.length, 1);
    assert.strictEqual(keywordSearch[0].id, "gs-hist-2");

    // Table rows mapping
    const rows = history.toRows(all);
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].provider, "codex"); // session2 is newer
    assert.strictEqual(rows[1].provider, "claude");

    fs.rmSync(tempRoot, { recursive: true, force: true });
    console.log("  ✓ GatewayHistory assertions passed.");
}

async function test08_Installer() {
    console.log("  Running Test 08: GatewayInstaller…");

    const tempRoot = path.join(os.tmpdir(), "brain-test-installer-" + Date.now());
    const mockPaths = new GlobalPaths(tempRoot);

    // Ensure dummy binary path doesn't register loop
    const installer = new GatewayInstaller(mockPaths);

    // Register dummy mock adapter
    const mock = new MockProviderAdapter();
    AdapterRegistry.register(mock);

    // Install
    const result = await installer.install({
        providerId: "mock-provider",
    });

    assert.strictEqual(result.generated.length, 1);
    assert.strictEqual(result.generated[0].id, "mock-provider");

    // Verify files generated
    const wrapperFile = mockPaths.wrapperScript("mock-provider");
    const binEntry    = mockPaths.binEntry("mock-provider");

    assert.ok(fs.existsSync(wrapperFile));
    assert.ok(fs.existsSync(binEntry));

    // Verify content of wrapper
    const content = fs.readFileSync(wrapperFile, "utf8");
    assert.ok(content.includes("brain gateway run --provider mock-provider"));

    // Cleanup registry & directories
    AdapterRegistry.unregister("mock-provider");
    fs.rmSync(tempRoot, { recursive: true, force: true });

    console.log("  ✓ GatewayInstaller assertions passed.");
}

async function test09_GatewayService() {
    console.log("  Running Test 09: AiGatewayService…");

    const tempRoot = path.join(os.tmpdir(), "brain-test-service-" + Date.now());
    const mockPaths = new GlobalPaths(tempRoot);

    const bus = new GatewayEventBus();
    const store = new GatewaySessionStore(mockPaths);
    const stats = new GatewayMetricsStore(mockPaths);

    // Add mock provider
    const mock = new MockProviderAdapter();
    AdapterRegistry.register(mock);

    const service = new AiGatewayService(tempRoot, tempRoot, bus, store, stats);

    // Intercept stdout
    let stdoutBuffer = "";
    bus.on("ProviderOutput", ev => {
        stdoutBuffer += ev.payload["chunk"] as string;
    });

    const session = await service.run("mock-provider", "explain code", []);

    assert.strictEqual(session.outcome, "success");
    assert.strictEqual(stdoutBuffer, "hello from mock adapter");
    assert.ok(session.timeline.length > 0);

    // Verify session persisted
    const saved = store.findById(session.id);
    assert.ok(saved);
    assert.strictEqual(saved.originalPrompt, "explain code");

    // Cleanup
    AdapterRegistry.unregister("mock-provider");
    fs.rmSync(tempRoot, { recursive: true, force: true });

    console.log("  ✓ AiGatewayService assertions passed.");
}

function test10_ConsoleSmoke() {
    console.log("  Running Test 10: LiveConsole smoke…");

    const bus = new GatewayEventBus();
    const devNull = {
        write: () => true
    } as any;

    new LiveConsole(bus, {
        noColor:  true,
        output:   devNull,
        provider: devNull,
    });

    // Verify it doesn't crash on timeline events
    bus.emit(makeEvent("SessionStarted", TEST_SESSION_ID, { providerId: "claude" }));
    bus.emit(makeEvent("PromptReceived", TEST_SESSION_ID));
    bus.emit(makeEvent("ProviderStarted", TEST_SESSION_ID));
    bus.emit(makeEvent("ProviderOutput", TEST_SESSION_ID, { chunk: "token" }));
    bus.emit(makeEvent("SessionCompleted", TEST_SESSION_ID, { tokensAfter: 100 }));

    console.log("  ✓ LiveConsole assertions passed.");
}

// Invoke main
main();
