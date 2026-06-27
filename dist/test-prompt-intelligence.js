// ──────────────────────────────────────────────────────────────────────────────
// BUILD-053 — Prompt Intelligence Engine — Verification Suite
// ──────────────────────────────────────────────────────────────────────────────
import assert from "assert";
import fs from "fs/promises";
import path from "path";
import { PromptIntelligenceService } from "./prompt-intelligence/service";
import { MockSDKProvider } from "./providers/mock";
import { getProviderProfile } from "./prompt-intelligence/provider-profiles";
import { PromptDiffEngine } from "./prompt-intelligence/diff";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_DIR = path.join(__dirname, "../");
async function runSuite() {
    console.log("==================================================");
    console.log("  RUNNING PROMPT INTELLIGENCE ENGINE VERIFICATION ");
    console.log("==================================================");
    const service = new PromptIntelligenceService(WORKSPACE_DIR);
    let passed = 0;
    let failed = 0;
    async function test(name, fn) {
        try {
            const res = fn();
            if (res && typeof res.then === "function") {
                await res;
            }
            console.log(`[PASS] ${name}`);
            passed++;
        }
        catch (err) {
            console.error(`[FAIL] ${name}:`, err);
            failed++;
        }
    }
    // Prepare mock folders
    await fs.mkdir(path.join(WORKSPACE_DIR, ".brain", "prompts", "cache"), { recursive: true });
    await fs.mkdir(path.join(WORKSPACE_DIR, ".brain", "prompts", "snapshots"), { recursive: true });
    // ──────────────────────────────────────────────────────────────────────────
    // Test 1: Service instance initialization
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 1: Initialization of PromptIntelligenceService", () => {
        assert.ok(service);
    });
    // ──────────────────────────────────────────────────────────────────────────
    // Test 2: Compile valid request
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 2: Compile a basic prompt package", async () => {
        const pkg = await service.compile({
            task: {
                id: "test-task-1",
                type: "create",
                title: "Create main function",
                status: "Pending",
                prerequisites: []
            },
            context: {
                workspaceRoot: WORKSPACE_DIR,
                rules: { rule1: "Must be clean" },
                constraints: { maxLines: "100" }
            },
            providerId: "claude-code"
        });
        assert.ok(pkg.id);
        assert.strictEqual(pkg.task.id, "test-task-1");
        assert.strictEqual(pkg.metadata.providerId, "claude-code");
        assert.ok(pkg.renderedPrompt.includes("CRITICAL EXECUTION RULES:"));
        assert.ok(pkg.diagnostics.assemblyDurationMs >= 0);
    });
    // ──────────────────────────────────────────────────────────────────────────
    // Test 3: Cache Hit on identical requests
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 3: Verify caching is working", async () => {
        const req = {
            task: {
                id: "test-cached-task",
                type: "modify",
                title: "Modify entrypoint",
                status: "Pending",
                prerequisites: []
            },
            context: {
                workspaceRoot: WORKSPACE_DIR,
                rules: {},
                constraints: {}
            },
            providerId: "claude-code"
        };
        const pkg1 = await service.compile(req);
        const pkg2 = await service.compile(req);
        assert.strictEqual(pkg1.metadata.hash, pkg2.metadata.hash);
        assert.strictEqual(pkg1.id, pkg2.id);
    });
    // ──────────────────────────────────────────────────────────────────────────
    // Test 4: Section ranking ordering
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 4: Verify prompt assembler ranks sections correctly", async () => {
        const sections = await service.assemble({
            task: {
                id: "test-rank-task",
                type: "refactor",
                title: "Refactor core loop",
                status: "Pending",
                prerequisites: []
            },
            context: {
                workspaceRoot: WORKSPACE_DIR,
                rules: { rule1: "Validation rule" },
                constraints: { maxTime: "5s" }
            },
            providerId: "claude-code"
        });
        assert.ok(sections.length > 0);
        // Assert priorities: System rules (100) first, Validation rules (40) last
        const systemSecIdx = sections.findIndex((s) => s.id === "system");
        const valSecIdx = sections.findIndex((s) => s.id === "validation");
        assert.ok(systemSecIdx !== -1);
        assert.ok(valSecIdx !== -1);
        assert.ok(sections[systemSecIdx].priority > sections[valSecIdx].priority);
    });
    // ──────────────────────────────────────────────────────────────────────────
    // Test 5: Optimization Passes (Dead Code Pruning, Normalization)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 5: Optimizer removes empty sections & normalizes spacing", () => {
        const rawSections = [
            { id: "s1", name: "System", content: "  Hello   World  \n\n\n  ", priority: 100 },
            { id: "s2", name: "Empty", content: "", priority: 50 },
            { id: "s3", name: "Normal", content: "Keep this", priority: 10 }
        ];
        const { optimizedSections, optimizations } = service.optimize(rawSections);
        assert.strictEqual(optimizedSections.length, 2);
        assert.strictEqual(optimizedSections[0].content, "Hello World");
        assert.ok(optimizations.some((o) => o.type === "whitespace-normalization"));
        assert.ok(optimizations.some((o) => o.type === "dead-code-pruning"));
    });
    // ──────────────────────────────────────────────────────────────────────────
    // Test 6: Optimization (Compression)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 6: Optimizer compresses verbose sections", () => {
        const longContent = "a".repeat(1000);
        const rawSections = [
            { id: "summary-section", name: "Summary", content: longContent, priority: 80 }
        ];
        const { optimizedSections, optimizations } = service.optimize(rawSections);
        assert.ok(optimizedSections[0].content.includes("Summary Compressed"));
        assert.ok(optimizations.some((o) => o.type === "summary-compression"));
    });
    // ──────────────────────────────────────────────────────────────────────────
    // Test 7: Optimization (Constraints Merging)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 7: Optimizer merges duplicate constraints", () => {
        const rawSections = [
            { id: "constraints-1", name: "Constraints", content: "- timeout: 10s\n- Timeout: 10s", priority: 80 }
        ];
        const { optimizedSections } = service.optimize(rawSections);
        assert.strictEqual(optimizedSections[0].content, "- timeout: 10s");
    });
    // ──────────────────────────────────────────────────────────────────────────
    // Test 8: Budgeting & Truncation
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 8: Budgeter respects provider limits and truncates low-priority", () => {
        const largeContent = "x".repeat(1000); // ~250 tokens
        const rawSections = [
            { id: "system", name: "System Rules", content: "High priority system content", priority: 100 },
            { id: "files", name: "Files Context", content: largeContent, priority: 10 }
        ];
        // Test with tight budget profile (e.g. 50 tokens = 200 chars limit)
        const tightProfile = {
            providerId: "claude-code",
            contextWindow: 50,
            metadata: {},
            limits: { maxContextTokens: 50 },
            pricing: {}
        };
        const { budgetedSections: budgeted } = service.budgeter.budget(rawSections, tightProfile);
        assert.ok(budgeted.find((s) => s.id === "system"));
        assert.ok(budgeted.find((s) => s.id === "files").content.includes("Truncated"));
    });
    // ──────────────────────────────────────────────────────────────────────────
    // Test 9: Renderer style formats (Claude - XML)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 9: Renderer outputs XML tags for Claude profile", () => {
        const sections = [
            { id: "task-instructions", name: "Task Instructions", content: "Do work", priority: 95 }
        ];
        const claudeProfile = getProviderProfile("claude-code");
        const rendered = service.render(sections, claudeProfile);
        assert.ok(rendered.includes("<task_instructions>"));
        assert.ok(rendered.includes("Do work"));
        assert.ok(rendered.includes("</task_instructions>"));
    });
    // ──────────────────────────────────────────────────────────────────────────
    // Test 10: Renderer style formats (Ollama - Markdown headers)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 10: Renderer outputs Markdown headers for Ollama profile", () => {
        const sections = [
            { id: "task", name: "Task Instructions", content: "Do work", priority: 95 }
        ];
        const ollamaProfile = getProviderProfile("ollama");
        const rendered = service.render(sections, ollamaProfile);
        assert.ok(rendered.includes("# Task Instructions"));
        assert.ok(rendered.includes("Do work"));
    });
    // ──────────────────────────────────────────────────────────────────────────
    // Test 11: Validation exceptions (Invalid Capability)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 11: Validator throws error on invalid task type capability", () => {
        const profile = getProviderProfile("ollama"); // doesn't support 'validate'
        const sections = [{ id: "system", name: "System", content: "test", priority: 100 }];
        assert.throws(() => {
            service.validate({ id: "test", type: "validate", title: "test", status: "Pending", prerequisites: [] }, sections, profile, { actualTokens: 100 });
        }, /does not support capability/);
    });
    // ──────────────────────────────────────────────────────────────────────────
    // Test 12: Validation exceptions (Token Overflow)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 12: Validator throws error on massive token overflow", () => {
        const profile = getProviderProfile("claude-code");
        const massiveSections = [
            { id: "system", name: "System", content: "x".repeat(900_000), priority: 100 }
        ];
        assert.throws(() => {
            service.validate({ id: "test", type: "create", title: "test", status: "Pending", prerequisites: [] }, massiveSections, profile, { actualTokens: 900_000 });
        }, /exceeds/);
    });
    // ──────────────────────────────────────────────────────────────────────────
    // Test 13: Prompt fingerprint generation
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 13: Fingerprint generates deterministic sha256 hash", async () => {
        const { PromptFingerprinter } = await import("./prompt-intelligence/fingerprint");
        const fingerprinter = new PromptFingerprinter();
        const payload = {
            promptContent: "hello",
            templateVersion: "1.0.0",
            learningVersion: "1.0.0",
            knowledgeVersion: "1.0.0",
            architectureVersion: "1.0.0",
            providerId: "claude-code",
            taskId: "t1",
            timestamp: "2026-01-01"
        };
        const fp1 = fingerprinter.generate(payload);
        const fp2 = fingerprinter.generate(payload);
        assert.strictEqual(fp1.hash, fp2.hash);
        assert.ok(fp1.hash.length === 64);
    });
    // ──────────────────────────────────────────────────────────────────────────
    // Test 14: Compare prompt diff engine
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 14: PromptDiffEngine detects changes, additions, and token deltas", () => {
        const originalPkg = {
            renderedPrompt: "Hello World\nKeep me",
            diagnostics: { optimizedSize: 20 },
            context: { task: { id: "t1" } },
            metadata: { hash: "h1" }
        };
        const repairPkg = {
            renderedPrompt: "Hello World\nKeep me\nAdded error message",
            diagnostics: { optimizedSize: 40 },
            context: { task: { id: "t2" } },
            metadata: { hash: "h2" }
        };
        const diffEngine = new PromptDiffEngine();
        const delta = diffEngine.diff(originalPkg, repairPkg);
        assert.strictEqual(delta.changedSections.length, 1);
        assert.strictEqual(delta.changedSections[0], "main"); // Fallback section is 'main'
        assert.strictEqual(delta.tokenDelta, 5); // 20 chars delta / 4
    });
    // ──────────────────────────────────────────────────────────────────────────
    // Test 15: Metrics recording
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 15: Metrics recording and retrieval", async () => {
        const getCompilations = (s) => Object.values(s.providerUtilization).reduce((a, b) => a + b, 0);
        const statsBefore = await service.statistics();
        const countBefore = getCompilations(statsBefore);
        await service.compile({
            task: { id: "test-metrics", type: "create", title: "test", status: "Pending", prerequisites: [] },
            context: { workspaceRoot: WORKSPACE_DIR, rules: {}, constraints: {} },
            providerId: "claude-code"
        });
        const statsAfter = await service.statistics();
        const countAfter = getCompilations(statsAfter);
        assert.ok(countAfter > countBefore);
    });
    // ──────────────────────────────────────────────────────────────────────────
    // Test 16: Snapshot sequential saving and directory reads
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 16: Prompt snapshots sequential file storage", async () => {
        const pkg = await service.compile({
            task: { id: "test-snapshot-t", type: "create", title: "test", status: "Pending", prerequisites: [] },
            context: { workspaceRoot: WORKSPACE_DIR, rules: {}, constraints: {} },
            providerId: "claude-code"
        });
        const snapshotsDir = path.join(WORKSPACE_DIR, ".brain", "prompts");
        const files = await fs.readdir(snapshotsDir);
        const match = files.some(f => f.includes(pkg.metadata.hash.slice(0, 8)));
        assert.ok(match);
    });
    // ──────────────────────────────────────────────────────────────────────────
    // Test 17: End-to-end execute integration with mock provider
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 17: Mock provider executes with ProviderExecutionRequest payload", async () => {
        const provider = new MockSDKProvider();
        const request = await service.buildExecutionRequest({ id: "mock-t", type: "create", title: "mock task", status: "Pending", prerequisites: [] }, { workspaceRoot: WORKSPACE_DIR }, provider.id, provider.profile());
        const response = await provider.execute(request, { workspaceRoot: WORKSPACE_DIR }, () => { });
        assert.strictEqual(response.status, "Completed");
        assert.ok(response.artifacts.length > 0);
    });
    // ──────────────────────────────────────────────────────────────────────────
    // Test 18: Section optimization - instruction compression pass
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 18: Optimizer prunes instruction dead code", () => {
        const raw = [
            { id: "validation", name: "Validation", content: "To be run:\n- npm test\n- npm test", priority: 40 }
        ];
        const { optimizedSections } = service.optimize(raw);
        assert.strictEqual(optimizedSections[0].content, "To be run:\n- npm test");
    });
    // ──────────────────────────────────────────────────────────────────────────
    // Test 19: Snapshot comparison tool facade
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 19: Facade compare reads and diffs snapshots successfully", async () => {
        const pkg1 = await service.compile({
            task: { id: "diff-t1", type: "create", title: "Original task text", status: "Pending", prerequisites: [] },
            context: { workspaceRoot: WORKSPACE_DIR, rules: {}, constraints: {} },
            providerId: "claude-code"
        });
        const pkg2 = await service.compile({
            task: { id: "diff-t2", type: "create", title: "Updated task text with errors", status: "Pending", prerequisites: [] },
            context: { workspaceRoot: WORKSPACE_DIR, rules: {}, constraints: {} },
            providerId: "claude-code"
        });
        const diffResult = await service.compare(pkg1.metadata.hash, pkg2.metadata.hash);
        assert.ok(diffResult.tokenDelta !== undefined);
        assert.ok(diffResult.addedLines >= 0);
    });
    // ──────────────────────────────────────────────────────────────────────────
    // Test 20: Budgeter keeps System Rules un-truncated
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 20: Budgeter guarantees system rules are never truncated", () => {
        const rawSections = [
            { id: "system", name: "System Rules", content: "SYSTEM_MUST_STAY", priority: 100 },
            { id: "files", name: "File details", content: "z".repeat(1000), priority: 10 }
        ];
        const tightProfile = {
            providerId: "claude-code",
            contextWindow: 10,
            metadata: {},
            limits: { maxContextTokens: 10 }, // extremely tiny budget
            pricing: {}
        };
        const { budgetedSections } = service.budgeter.budget(rawSections, tightProfile);
        const sys = budgetedSections.find((s) => s.id === "system");
        assert.strictEqual(sys.content, "SYSTEM_MUST_STAY");
    });
    // Wait a brief moment for async assertions to print
    setTimeout(() => {
        console.log("\n==================================================");
        console.log(`  VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
        console.log("==================================================");
        if (failed > 0) {
            process.exit(1);
        }
        else {
            process.exit(0);
        }
    }, 100);
}
runSuite().catch(console.error);
