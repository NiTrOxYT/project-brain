// ──────────────────────────────────────────────────────────────────────────────
// BUILD-057 — Multi-Agent Shared Memory — Verification Suite
// 50 Scenarios covering registry, blackboard, assignment, coordination,
// conflict detection, conflict resolution, consensus, storage, metrics,
// diagnostics and integrations.
// ──────────────────────────────────────────────────────────────────────────────

import assert from "assert";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dedicated temp test workspace
const TEST_WORKSPACE = path.join(__dirname, "..", ".brain-test-shared-memory");

import { SharedMemoryService } from "./shared-memory/service";
import { CollaborationTask } from "./shared-memory/types";
import { AgentRegistrationError, AssignmentError, ConflictError, ConsensusError } from "./shared-memory/errors";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
    try {
        const res = fn();
        if (res && typeof (res as any).then === "function") {
            await res;
        }
        console.log(`  [PASS] ${name}`);
        passed++;
    } catch (err: any) {
        console.error(`  [FAIL] ${name}: ${err.message || err}`);
        failed++;
    }
}

async function setup() {
    await fs.mkdir(TEST_WORKSPACE, { recursive: true });
}

async function teardown() {
    try {
        await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
    } catch { /* best-effort */ }
}

async function runSuite() {
    console.log("");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  BUILD-057 — Multi-Agent Shared Memory — Tests");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("");

    await setup();

    const service = new SharedMemoryService(TEST_WORKSPACE, TEST_WORKSPACE);

    // ──────────────────────────────────────────────────────────────────────────
    // AGENT REGISTRY SCENARIOS (1-6)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 1: AgentRegistry — register new agent", async () => {
        const session = await service.registerAgent({
            id: "claude-code",
            name: "Claude Code",
            capabilities: ["modify", "refactor"],
            version: "1.0.0",
            priority: 90
        });
        assert.strictEqual(session.agentId, "claude-code");
        assert.strictEqual(session.status, "active");
    });

    await test("Test 2: AgentRegistry — registration duplicate blocks", async () => {
        await assert.rejects(
            service.registerAgent({
                id: "claude-code",
                name: "Claude Code",
                capabilities: ["modify"],
                version: "1.0.0",
                priority: 90
            }),
            AgentRegistrationError
        );
    });

    await test("Test 3: AgentRegistry — unregister agent", async () => {
        await service.unregisterAgent("claude-code");
        const status = (service as any).registry.status("claude-code");
        assert.strictEqual(status, null);
    });

    await test("Test 4: AgentRegistry — unregister non-existent throws", async () => {
        await assert.rejects(service.unregisterAgent("nonexistent"), AgentRegistrationError);
    });

    await test("Test 5: AgentRegistry — agent heartbeat updates session", async () => {
        await service.registerAgent({
            id: "gemini-cli",
            name: "Gemini CLI",
            capabilities: ["validate"],
            version: "1.0.0",
            priority: 80
        });
        const before = (service as any).registry.status("gemini-cli").lastHeartbeatAt;
        await new Promise(r => setTimeout(r, 10));
        (service as any).registry.heartbeat("gemini-cli");
        const after = (service as any).registry.status("gemini-cli").lastHeartbeatAt;
        assert.ok(after.localeCompare(before) >= 0);
    });

    await test("Test 6: AgentRegistry — heartbeat on nonexistent throws", () => {
        assert.throws(() => (service as any).registry.heartbeat("nonexistent"), AgentRegistrationError);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // ASSIGNMENT ENGINE SCENARIOS (7-11)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 7: AssignmentEngine — assigns based on capabilities", async () => {
        const tasks = [{ id: "t1", title: "Task 1", type: "validate", status: "Pending" as any, prerequisites: [] }];
        const assigns = await service.assignTasks(tasks);
        assert.strictEqual(assigns[0].agentId, "gemini-cli");
    });

    await test("Test 8: AssignmentEngine — falls back to priority if no capability match", async () => {
        // Add aider with higher priority but different capability
        await service.registerAgent({
            id: "aider",
            name: "Aider",
            capabilities: ["cleanup"],
            version: "1.0.0",
            priority: 100
        });
        const tasks = [{ id: "t2", title: "Task 2", type: "unknown-capability", status: "Pending" as any, prerequisites: [] }];
        const assigns = await service.assignTasks(tasks);
        assert.strictEqual(assigns[0].agentId, "aider"); // highest priority (100)
    });

    await test("Test 9: AssignmentEngine — learning recommendation override", async () => {
        const tasks = [{ id: "t3", title: "Task 3", type: "validate", status: "Pending" as any, prerequisites: [] }];
        const assigns = await service.assignTasks(tasks, "aider");
        assert.strictEqual(assigns[0].agentId, "aider"); // override matched
    });

    await test("Test 10: AssignmentEngine — stable deterministic assignment fallback", async () => {
        await service.registerAgent({
            id: "opencode",
            name: "OpenCode",
            capabilities: ["cleanup"],
            version: "1.0.0",
            priority: 100 // same as aider
        });
        const tasks = [{ id: "t4", title: "Task 4", type: "cleanup", status: "Pending" as any, prerequisites: [] }];
        const assigns = await service.assignTasks(tasks);
        // aider is alphabetically first compared to opencode
        assert.strictEqual(assigns[0].agentId, "aider");
    });

    await test("Test 11: AssignmentEngine — throws on empty registry", async () => {
        const emptyService = new SharedMemoryService(TEST_WORKSPACE, TEST_WORKSPACE);
        await assert.rejects(
            emptyService.assignTasks([{ id: "t5", title: "Task 5", type: "cleanup", status: "Pending" as any, prerequisites: [] }]),
            AssignmentError
        );
    });

    // ──────────────────────────────────────────────────────────────────────────
    // BLACKBOARD SCENARIOS (12-16)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 12: Blackboard — publish observation", async () => {
        const obs = await service.publishObservation("aider", {
            observation: "Syntax error on main.ts line 20",
            severity: "error"
        });
        assert.strictEqual(obs.agentId, "aider");
        assert.strictEqual(service.getObservations().length, 1);
    });

    await test("Test 13: Blackboard — publish finding", async () => {
        const f = await service.publishFinding("aider", {
            taskId: "t1",
            finding: "Memory leaks in query engine detected",
            severity: "high"
        });
        assert.strictEqual(f.severity, "high");
        assert.strictEqual(service.getFindings().length, 1);
    });

    await test("Test 14: Blackboard — publish warning", async () => {
        const w = await (service as any).blackboard.publishWarning({
            message: "Unused imports in index.ts",
            reportedBy: "aider"
        });
        assert.strictEqual(w.reportedBy, "aider");
    });

    await test("Test 15: Blackboard — publish fact", async () => {
        const fact = await (service as any).blackboard.publishFact({
            key: "framework",
            value: "react",
            sourceAgentId: "aider"
        });
        assert.strictEqual(fact.value, "react");
    });

    await test("Test 16: Blackboard — publish issue", async () => {
        const issue = await (service as any).blackboard.publishIssue({
            title: "Build failure",
            description: "TS compilation errors",
            reportedBy: "aider",
            status: "open"
        });
        assert.strictEqual(issue.title, "Build failure");
    });

    // ──────────────────────────────────────────────────────────────────────────
    // ARTIFACT STORE SCENARIOS (17-20)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 17: ArtifactStore — store code artifact", async () => {
        const art = await service.publishArtifact("aider", {
            taskId: "t1",
            type: "code",
            filePath: "src/main.ts",
            content: "console.log('hi');",
            metadata: {}
        });
        assert.strictEqual(art.type, "code");
        assert.strictEqual(service.getArtifacts().length, 1);
    });

    await test("Test 18: ArtifactStore — retrieve artifact by ID", () => {
        const list = service.getArtifacts();
        const art = (service as any).artifactStore.get(list[0].id);
        assert.ok(art);
        assert.strictEqual(art.filePath, "src/main.ts");
    });

    await test("Test 19: ArtifactStore — list artifacts for task", () => {
        const list = (service as any).artifactStore.listForTask("t1");
        assert.strictEqual(list.length, 1);
    });

    await test("Test 20: ArtifactStore — returns null on nonexistent", () => {
        const art = (service as any).artifactStore.get("nonexistent");
        assert.strictEqual(art, null);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // COORDINATION SCENARIOS (21-25)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 21: CoordinationEngine — claim task successfully", async () => {
        const task: CollaborationTask = { id: "claim-t", title: "Claim", type: "cleanup", status: "Pending", prerequisites: [] };
        service.addTask(task);
        const assign = await service.claimTask("claim-t", "aider");
        assert.strictEqual(assign.status, "running");
    });

    await test("Test 22: CoordinationEngine — claim blocks on prerequisite", async () => {
        const task: CollaborationTask = { id: "claim-t2", title: "Claim 2", type: "cleanup", status: "Pending", prerequisites: ["claim-t"] };
        service.addTask(task);
        // claim-t is currently running (not completed yet)
        await assert.rejects(service.claimTask("claim-t2", "aider"), AssignmentError);
    });

    await test("Test 23: CoordinationEngine — complete task releases prerequisite blocks", async () => {
        await service.completeTask("claim-t", true);
        const assign = await service.claimTask("claim-t2", "aider");
        assert.strictEqual(assign.status, "running");
    });

    await test("Test 24: CoordinationEngine — waitBarrier matches completed tasks", async () => {
        const res = await (service as any).coordination.waitBarrier(["claim-t"]);
        assert.strictEqual(res, true);
    });

    await test("Test 25: CoordinationEngine — waitBarrier fails on running task", async () => {
        const res = await (service as any).coordination.waitBarrier(["claim-t2"]);
        assert.strictEqual(res, false);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CONFLICT DETECTION SCENARIOS (26-29)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 26: ConflictDetector — detects file collisions", async () => {
        // Store another artifact for same file path by different agent
        await service.publishArtifact("gemini-cli", {
            taskId: "t1",
            type: "code",
            filePath: "src/main.ts",
            content: "console.log('hi different');",
            metadata: {}
        });

        const conflicts = service.detectConflicts();
        assert.ok(conflicts.some(c => c.conflictType === "file_collision"));
    });

    await test("Test 27: ConflictDetector — detects decision contradictions", async () => {
        await service.publishDecision("use-conflict-option", "first decision", ["aider"]);
        await service.publishDecision("use-conflict-option", "second decision", ["gemini-cli"]);

        const conflicts = service.detectConflicts();
        assert.ok(conflicts.some(c => c.conflictType === "contradictory_decision"));
    });

    await test("Test 28: ConflictDetector — duplicates are skipped once tracked", () => {
        const c1 = service.detectConflicts().length;
        const c2 = service.detectConflicts().length;
        assert.strictEqual(c1, c2);
    });

    await test("Test 29: ConflictDetector — returns empty when no conflicts", () => {
        const cleanService = new SharedMemoryService(TEST_WORKSPACE, TEST_WORKSPACE);
        const conflicts = cleanService.detectConflicts();
        assert.strictEqual(conflicts.length, 0);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CONFLICT RESOLUTION SCENARIOS (30-33)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 30: ConflictResolver — resolves file collision using priorities", async () => {
        const conflicts = service.detectConflicts();
        const fc = conflicts.find(c => c.conflictType === "file_collision")!;

        const res = await service.resolveConflicts("aider");
        assert.ok(res.length > 0);
        assert.strictEqual(fc.status, "resolved");
    });

    await test("Test 31: ConflictResolver — resolution stores resolution record", () => {
        const state = (service as any).model.getState();
        assert.ok(state.resolutions.size > 0);
    });

    await test("Test 32: ConflictResolver — throws resolution error on invalid conflict state", async () => {
        const invalidRecord = { id: "invalid-c", conflictType: "file_collision" as any, conflictingEntities: [], involvedAgents: [], timestamp: "", status: "open" as any };
        await assert.rejects(
            Promise.resolve().then(() => (service as any).conflictResolver.resolve(invalidRecord)),
            ConflictError
        );
    });

    await test("Test 33: ConflictResolver — double resolve returns existing resolution", () => {
        const state = (service as any).model.getState();
        const conf = state.conflicts.find((c: any) => c.status === "resolved");
        const res = (service as any).conflictResolver.resolve(conf);
        assert.ok(res);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CONSENSUS SCENARIOS (34-38)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 34: ConsensusEngine — propose voting consensus", async () => {
        const proposal = await service.proposeConsensus({
            proposerAgentId: "aider",
            title: "Commit main changes",
            description: "Apply artifact modifications",
            proposalType: "commit",
            targetId: "t1"
        });
        assert.strictEqual(proposal.status, "propose");
    });

    await test("Test 35: ConsensusEngine — vote accept updates status", async () => {
        const state = (service as any).model.getState();
        const prop = state.proposals[0];
        await service.voteConsensus(prop.id, "aider", "accept");
        assert.strictEqual(prop.votes["aider"], "accept");
        assert.strictEqual(prop.status, "review");
    });

    await test("Test 36: ConsensusEngine — finalize consensus accepts on majority", async () => {
        const state = (service as any).model.getState();
        const prop = state.proposals[0];
        const dec = await service.finalizeConsensus(prop.id);
        assert.strictEqual(dec.finalStatus, "accept");
        assert.strictEqual(prop.status, "finalize");
    });

    await test("Test 37: ConsensusEngine — finalize proposal not found throws", async () => {
        await assert.rejects(service.finalizeConsensus("nonexistent"), ConsensusError);
    });

    await test("Test 38: ConsensusEngine — vote on finalized proposal throws", async () => {
        const state = (service as any).model.getState();
        const prop = state.proposals[0];
        await assert.rejects(service.voteConsensus(prop.id, "aider", "accept"), ConsensusError);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // TIMELINE SCENARIOS (39-41)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 39: Timeline — appends and loads logs", async () => {
        const timeline = service.getTimeline();
        const evs = await timeline.load();
        assert.ok(evs.events.length > 0);
    });

    await test("Test 40: Timeline — registers payload fields", () => {
        const timeline = service.getTimeline();
        const ev = timeline.getEvents().find(e => e.type === "ConsensusProposed");
        assert.ok(ev);
        assert.ok(ev.payload.proposal);
    });

    await test("Test 41: Timeline — append persistence error logs check", async () => {
        const invalidTimeline = new (service as any).timeline.constructor("/nonexistent-root-path/forbidden");
        await assert.rejects(invalidTimeline.append("TestEv"), Error);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // STORAGE SCENARIOS (42-45)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 42: SharedMemoryStorage — saves state snapshots", async () => {
        const snap = await service.snapshot("snap-test");
        assert.strictEqual(snap.snapshotId, "snap-test");
    });

    await test("Test 43: SharedMemoryStorage — restore snapshot", async () => {
        await service.restore("snap-test");
        const state = (service as any).model.getState();
        assert.ok(state.agents.has("aider"));
    });

    await test("Test 44: SharedMemoryStorage — restore latest snapshot pointer", async () => {
        await service.restoreLatest();
        const state = (service as any).model.getState();
        assert.ok(state.agents.has("aider"));
    });

    await test("Test 45: SharedMemoryStorage — load non-existent returns null", async () => {
        const snap = await (service as any).storage.loadSnapshot("nonexistent");
        assert.strictEqual(snap, null);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // INTEGRATION SCENARIOS (46-50)
    // ──────────────────────────────────────────────────────────────────────────
    await test("Test 46: WorkspaceEngine — blocks commit if open conflicts exist", async () => {
        const { WorkspaceEngine } = await import("./workspace/workspace-engine");
        const workspace = new WorkspaceEngine({ workspaceRoot: TEST_WORKSPACE });

        // Add an open conflict in shared memory
        const conflictsService = new SharedMemoryService(TEST_WORKSPACE, TEST_WORKSPACE);
        conflictsService.detectConflicts(); // creates a conflict
        const state = (conflictsService as any).model.getState();
        state.conflicts.push({
            id: "open-c",
            conflictType: "file_collision",
            conflictingEntities: ["src/main.ts"],
            involvedAgents: ["aider", "gemini-cli"],
            timestamp: new Date().toISOString(),
            status: "open"
        });
        await conflictsService.snapshot("latest");

        // Stage operations and commit should throw error due to open conflict
        const tx = workspace.beginTransaction();
        workspace.stage(tx.id, { kind: "WriteFile", path: "src/main.ts", content: "hello" });
        await assert.rejects(workspace.commit(tx.id), Error);
    });

    await test("Test 47: WorkspaceEngine — blocks commit if unfinalized consensus proposals exist", async () => {
        const { WorkspaceEngine } = await import("./workspace/workspace-engine");
        const workspace = new WorkspaceEngine({ workspaceRoot: TEST_WORKSPACE });

        // Clear conflicts, keep open consensus proposal
        const conflictsService = new SharedMemoryService(TEST_WORKSPACE, TEST_WORKSPACE);
        const state = (conflictsService as any).model.getState();
        state.conflicts = []; // resolve
        state.proposals = [{
            id: "open-p",
            proposerAgentId: "aider",
            title: "proposal",
            description: "",
            proposalType: "commit",
            targetId: "t1",
            votes: {},
            status: "propose",
            timestamp: new Date().toISOString()
        }];
        await conflictsService.snapshot("latest");

        const tx = workspace.beginTransaction();
        workspace.stage(tx.id, { kind: "WriteFile", path: "src/main.ts", content: "hello" });
        await assert.rejects(workspace.commit(tx.id), Error);
    });

    await test("Test 48: ProviderRuntimeService — claims and completes tasks in Shared Memory", async () => {
        const { ProviderRuntimeService } = await import("./provider-runtime/service");
        const runtime = new ProviderRuntimeService(TEST_WORKSPACE);

        const mockProv: any = {
            id: "mock-provider",
            name: "Mock Provider",
            metadata: () => ({ displayName: "Mock Provider", defaultModel: "mock-model" }),
            profile: () => ({ maxTokens: 40000, costPerThousand: 0.01 }),
            capabilities: () => ["modify"],
            supportsCapability: (capability: any) => capability === "modify",
            health: async () => ({ status: "Healthy" }),
            execute: async (task: any, ctx: any, onEvent: any) => {
                onEvent({ type: "TaskStarted", taskId: task.id, timestamp: new Date().toISOString() });
                return {
                    status: "Completed",
                    workspaceTransactionId: "tx-mock",
                    artifacts: []
                };
            }
        };
        (runtime as any).register(mockProv);

        // Pre-register task in Shared Memory
        const conflictsService = new SharedMemoryService(TEST_WORKSPACE, TEST_WORKSPACE);
        conflictsService.addTask({
            id: "runtime-t1",
            title: "Task 1",
            type: "modify",
            status: "Pending",
            prerequisites: []
        });

        const res = await runtime.execute({
            task: { id: "runtime-t1", type: "modify", title: "Task 1", status: "Running", prerequisites: [] },
            context: { workspaceRoot: TEST_WORKSPACE }
        });
        assert.ok(res);

        // Check that task is marked completed in Shared Memory
        const state = (conflictsService as any).model.getState();
        const task = state.tasks.get("runtime-t1");
        assert.strictEqual(task.status, "Completed");
    });

    await test("Test 49: LearningEngineService — records shared memory statistics in metadata", async () => {
        const { LearningEngineService } = await import("./learning-engine/service");
        const learning = new LearningEngineService(TEST_WORKSPACE);
        const res = await learning.learn([] as any);
        assert.ok(res.success);

        const metadata = await (learning as any).storage.loadMetadata();
        assert.ok(metadata.collaborationEfficiency !== undefined);
    });

    await test("Test 50: QueryEngineService — returns collaboration diagnostics", async () => {
        const { QueryEngineService } = await import("./query-engine/service");
        const queryService = new QueryEngineService(TEST_WORKSPACE, TEST_WORKSPACE);
        const res = await queryService.query({ query: "fix main" });
        assert.ok(res.diagnostics);
        assert.ok(res.diagnostics.activeAgents !== undefined);
    });

    // ─── Teardown ────────────────────────────────────────────────────────────

    await teardown();

    console.log("");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`  RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("");

    if (failed > 0) {
        process.exit(1);
    }
}

runSuite().catch(err => {
    console.error("Suite crashed:", err);
    process.exit(1);
});
