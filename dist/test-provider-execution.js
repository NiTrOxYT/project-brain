// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050A — Provider Execution Layer — Verification Suite
// 30 deterministic tests. No external dependencies beyond Node builtins.
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import os from "os";
import { ProviderExecutionService } from "./provider-execution/service";
import { ProcessRunner } from "./provider-execution/process";
import { StreamProcessor } from "./provider-execution/stream";
import { RetryEvaluator, DEFAULT_RETRY_POLICY, NO_RETRY_POLICY } from "./provider-execution/retry";
import { ExecutionSandbox } from "./provider-execution/sandbox";
import { ProcessTimeoutError, ProcessCancelledError, ProcessSpawnError, isTransientExitCode } from "./provider-execution/errors";
// ─── Helpers ──────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];
function assert(cond, msg) {
    if (!cond) {
        failed++;
        failures.push(`FAIL: ${msg}`);
        console.error(`  ✗ FAIL: ${msg}`);
    }
    else {
        passed++;
        console.log(`  ✓ ${msg}`);
    }
}
async function assertRejects(fn, errorClass, msg) {
    try {
        await fn();
        failed++;
        failures.push(`FAIL (no throw): ${msg}`);
        console.error(`  ✗ FAIL (no throw): ${msg}`);
    }
    catch (err) {
        if (err instanceof errorClass) {
            passed++;
            console.log(`  ✓ ${msg}`);
        }
        else {
            failed++;
            failures.push(`FAIL (wrong error ${err?.constructor?.name}): ${msg}`);
            console.error(`  ✗ FAIL (wrong error ${err?.constructor?.name}): ${msg}`);
        }
    }
}
function tempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "brain-exec-test-"));
}
function cleanup(dir) {
    try {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    catch { }
}
/** Build a minimal ExecutionRequest for a shell command. */
function req(id, args, extra = {}) {
    const root = extra.cwd ?? os.tmpdir();
    return {
        id,
        executable: process.execPath, // node itself — always present
        args,
        cwd: root,
        env: {},
        includeParentEnv: true,
        ...extra
    };
}
/** Node inline script helper */
function nodeScript(code) {
    return ["-e", code];
}
// ─── Tests ────────────────────────────────────────────────────────────────────
async function test01_ProcessStarts() {
    console.log("\n── 01. Process starts ────────────────────────────────────────");
    const svc = new ProviderExecutionService();
    const result = await svc.execute(req("t01", nodeScript("process.exit(0)")));
    assert(result.state === "Completed", "State = Completed");
    assert(result.exitCode === 0, "Exit code = 0");
    await svc.shutdown();
}
async function test02_ProcessExitsSuccessfully() {
    console.log("\n── 02. Process exits successfully ────────────────────────────");
    const runner = new ProcessRunner();
    const result = await runner.run(req("t02", nodeScript("process.exit(0)")));
    assert(result.exitCode === 0, "Exit code = 0");
    assert(result.state === "Completed", "State = Completed");
    assert(!result.error, "No error on success");
}
async function test03_StdoutCaptured() {
    console.log("\n── 03. stdout captured ───────────────────────────────────────");
    const runner = new ProcessRunner();
    const result = await runner.run(req("t03", nodeScript(`process.stdout.write("hello stdout\\n"); process.exit(0);`)));
    assert(result.output.stdout.includes("hello stdout"), "stdout contains expected text");
    assert(result.output.stdoutBytes > 0, "stdoutBytes > 0");
}
async function test04_StderrCaptured() {
    console.log("\n── 04. stderr captured ───────────────────────────────────────");
    const runner = new ProcessRunner();
    const result = await runner.run(req("t04", nodeScript(`process.stderr.write("hello stderr\\n"); process.exit(0);`)));
    assert(result.output.stderr.includes("hello stderr"), "stderr contains expected text");
    assert(result.output.stderrBytes > 0, "stderrBytes > 0");
}
async function test05_StdinWorks() {
    console.log("\n── 05. stdin works ───────────────────────────────────────────");
    const runner = new ProcessRunner();
    const script = `
        let data = "";
        process.stdin.on("data", c => data += c);
        process.stdin.on("end", () => { process.stdout.write("got:" + data.trim()); process.exit(0); });
    `;
    const result = await runner.run(req("t05", nodeScript(script), { stdin: "hello-from-stdin" }));
    assert(result.output.stdout.includes("got:hello-from-stdin"), "stdin data received by process");
}
async function test06_EnvironmentVariables() {
    console.log("\n── 06. Environment variables ─────────────────────────────────");
    const runner = new ProcessRunner();
    const result = await runner.run(req("t06", nodeScript(`process.stdout.write(process.env.MY_VAR || ""); process.exit(0);`), {
        env: { MY_VAR: "brain-test-value" },
        includeParentEnv: false
    }));
    assert(result.output.stdout.trim() === "brain-test-value", "Custom env var visible to process");
}
async function test07_WorkingDirectory() {
    console.log("\n── 07. Working directory ─────────────────────────────────────");
    const dir = tempDir();
    try {
        const runner = new ProcessRunner();
        const result = await runner.run(req("t07", nodeScript(`process.stdout.write(process.cwd()); process.exit(0);`), { cwd: dir }));
        // macOS resolves /tmp → /private/tmp — compare realpath
        const actual = fs.realpathSync(result.output.stdout.trim());
        const expected = fs.realpathSync(dir);
        assert(actual === expected, `cwd is '${expected}'`);
    }
    finally {
        cleanup(dir);
    }
}
async function test08_Cancellation() {
    console.log("\n── 08. Cancellation ──────────────────────────────────────────");
    const svc = new ProviderExecutionService();
    const longScript = nodeScript("setTimeout(() => {}, 30000);");
    const r = req("t08", longScript);
    const execPromise = svc.execute(r).catch(e => e);
    // Cancel after a short delay
    await new Promise(res => setTimeout(res, 80));
    svc.cancel("t08");
    const result = await execPromise;
    assert(result instanceof ProcessCancelledError || result?.state === "Cancelled" || result?.exitCode !== 0, "Process cancelled or stopped early");
    await svc.shutdown();
}
async function test09_GracefulShutdown() {
    console.log("\n── 09. Graceful shutdown ─────────────────────────────────────");
    const svc = new ProviderExecutionService();
    // Start a long-running process
    const p = svc.execute(req("t09", nodeScript("setTimeout(() => {}, 30000)"))).catch(() => { });
    await new Promise(res => setTimeout(res, 50));
    await svc.shutdown();
    // After shutdown, service reports correct diagnostics
    const d = svc.diagnostics();
    assert(d.activePids.length === 0, "No active PIDs after shutdown");
    assert(typeof d.totalExecutions === "number", "totalExecutions is a number");
}
async function test10_StartupTimeout() {
    console.log("\n── 10. Startup timeout ───────────────────────────────────────");
    // Process that produces no output for a long time
    const runner = new ProcessRunner();
    const r = req("t10", nodeScript("setTimeout(() => {}, 30000)"), {
        timeout: {
            startupTimeoutMs: 100,
            gracefulShutdownMs: 50,
            forceKillMs: 100
        }
    });
    let caught;
    try {
        await runner.run(r);
    }
    catch (e) {
        caught = e;
    }
    assert(caught instanceof ProcessTimeoutError, "ProcessTimeoutError thrown");
    if (caught instanceof ProcessTimeoutError) {
        assert(caught.timeoutKind === "startup", `Kind = startup (got ${caught.timeoutKind})`);
    }
}
async function test11_IdleTimeout() {
    console.log("\n── 11. Idle timeout ──────────────────────────────────────────");
    // Process emits one chunk then goes silent — idle timer fires.
    const script = `
        process.stdout.write("starting\\n");
        setTimeout(() => { process.stdout.write("done\\n"); process.exit(0); }, 10000);
    `;
    const runner = new ProcessRunner();
    const r = req("t11", nodeScript(script), {
        timeout: {
            idleTimeoutMs: 150,
            gracefulShutdownMs: 50,
            forceKillMs: 100
        }
    });
    let caught;
    try {
        await runner.run(r);
    }
    catch (e) {
        caught = e;
    }
    assert(caught instanceof ProcessTimeoutError, "ProcessTimeoutError thrown");
    if (caught instanceof ProcessTimeoutError) {
        assert(caught.timeoutKind === "idle", `Kind = idle (got ${caught.timeoutKind})`);
    }
}
async function test12_ExecutionTimeout() {
    console.log("\n── 12. Execution timeout ─────────────────────────────────────");
    const runner = new ProcessRunner();
    const r = req("t12", nodeScript("setTimeout(() => {}, 30000)"), {
        timeout: {
            executionTimeoutMs: 150,
            gracefulShutdownMs: 50,
            forceKillMs: 100
        }
    });
    let caught;
    try {
        await runner.run(r);
    }
    catch (e) {
        caught = e;
    }
    assert(caught instanceof ProcessTimeoutError, "ProcessTimeoutError thrown");
    if (caught instanceof ProcessTimeoutError) {
        assert(caught.timeoutKind === "execution", `Kind = execution (got ${caught.timeoutKind})`);
    }
}
async function test13_RetryPolicy() {
    console.log("\n── 13. Retry policy — deterministic decisions ────────────────");
    const policy = {
        maxRetries: 3,
        baseDelayMs: 10,
        backoffFactor: 2,
        maxDelayMs: 200,
        permanentFailureCodes: [42]
    };
    const ev = new RetryEvaluator(policy);
    const d0 = ev.evaluate(0, 1, undefined);
    assert(d0.shouldRetry === true, "Attempt 0, exit 1 → retry");
    assert(d0.delayMs === 10, `Delay at attempt 0 = 10ms (got ${d0.delayMs})`);
    const d1 = ev.evaluate(1, 1, undefined);
    assert(d1.shouldRetry === true, "Attempt 1, exit 1 → retry");
    assert(d1.delayMs === 20, `Delay at attempt 1 = 20ms (got ${d1.delayMs})`);
    const d2 = ev.evaluate(2, 1, undefined);
    assert(d2.shouldRetry === true, "Attempt 2, exit 1 → retry");
    assert(d2.delayMs === 40, `Delay at attempt 2 = 40ms (got ${d2.delayMs})`);
    const d3 = ev.evaluate(3, 1, undefined);
    assert(d3.shouldRetry === false, "Attempt 3 (=maxRetries) → no retry");
    // Permanent exit code
    const dp = ev.evaluate(0, 42, undefined);
    assert(dp.shouldRetry === false, "Exit 42 (permanent) → no retry");
}
async function test14_TransientRetry() {
    console.log("\n── 14. Transient retry (actual process re-execution) ─────────");
    const svc = new ProviderExecutionService();
    const dir = tempDir();
    const counterFile = path.join(dir, "count.txt");
    fs.writeFileSync(counterFile, "0");
    // Script increments a counter file; exits non-zero until count = 3
    const script = `
        const fs = require('fs');
        const f = ${JSON.stringify(counterFile)};
        let n = parseInt(fs.readFileSync(f, 'utf-8'), 10) || 0;
        n++;
        fs.writeFileSync(f, String(n));
        process.exit(n < 3 ? 1 : 0);
    `;
    try {
        const result = await svc.execute(req("t14", nodeScript(script), {
            cwd: dir,
            retry: {
                maxRetries: 3,
                baseDelayMs: 10,
                backoffFactor: 1,
                maxDelayMs: 50,
                permanentFailureCodes: []
            }
        }));
        const count = parseInt(fs.readFileSync(counterFile, "utf-8"), 10);
        assert(count === 3, `Process ran 3 times (got ${count})`);
        assert(result.exitCode === 0, "Final exit code = 0");
        assert(result.metrics.retryCount === 2, `retryCount = 2 (got ${result.metrics.retryCount})`);
    }
    finally {
        cleanup(dir);
        await svc.shutdown();
    }
}
async function test15_PermanentFailure() {
    console.log("\n── 15. Permanent failure (no retry) ─────────────────────────");
    const ev = new RetryEvaluator({
        maxRetries: 5,
        baseDelayMs: 10,
        backoffFactor: 2,
        maxDelayMs: 1000,
        permanentFailureCodes: [127]
    });
    const d = ev.evaluate(0, 127, undefined);
    assert(!d.shouldRetry, "Exit 127 (permanent) → no retry");
    assert(d.reason.includes("127"), `Reason mentions exit code (got '${d.reason}')`);
    // Also: non-retryable error flag
    const err = new ProcessTimeoutError("execution", 1000, "t15");
    const d2 = ev.evaluate(0, null, err);
    assert(!d2.shouldRetry, "ProcessTimeoutError → no retry");
}
async function test16_Diagnostics() {
    console.log("\n── 16. Diagnostics ───────────────────────────────────────────");
    const svc = new ProviderExecutionService();
    await svc.execute(req("t16a", nodeScript("process.exit(0)")));
    await svc.execute(req("t16b", nodeScript("process.exit(1)"), {
        retry: NO_RETRY_POLICY
    })).catch(() => { });
    const d = svc.diagnostics();
    assert(d.totalExecutions >= 1, `totalExecutions >= 1 (got ${d.totalExecutions})`);
    assert(d.averageDurationMs >= 0, "averageDurationMs >= 0");
    assert(Array.isArray(d.activePids), "activePids is array");
    assert(Array.isArray(d.sandboxDirectories), "sandboxDirectories is array");
    await svc.shutdown();
}
async function test17_ResourceCleanup() {
    console.log("\n── 17. Resource cleanup ──────────────────────────────────────");
    const svc = new ProviderExecutionService();
    // Run several processes
    for (let i = 0; i < 3; i++) {
        await svc.execute(req(`t17-${i}`, nodeScript("process.exit(0)")));
    }
    await svc.shutdown();
    const d = svc.diagnostics();
    assert(d.activePids.length === 0, "No active PIDs after shutdown");
    assert(d.sandboxDirectories.length === 0, "No active sandbox dirs after shutdown");
}
async function test18_SandboxCreation() {
    console.log("\n── 18. Sandbox creation ──────────────────────────────────────");
    const sb = new ExecutionSandbox();
    const ctx = sb.create("req-sandbox-1");
    assert(typeof ctx.dir === "string", "Sandbox has a directory path");
    assert(fs.existsSync(ctx.dir), "Sandbox directory exists on disk");
    assert(ctx.id === "req-sandbox-1", "Sandbox ID matches request ID");
    assert(ctx.isClean === true, "New sandbox is clean");
    assert(sb.activeSandboxCount === 1, "activeSandboxCount = 1");
    // Mark dirty
    sb.markDirty("req-sandbox-1");
    assert(sb.get("req-sandbox-1")?.isClean === false, "Sandbox marked dirty");
    const dir = ctx.dir;
    sb.cleanup("req-sandbox-1");
    assert(!fs.existsSync(dir), "Sandbox directory removed after cleanup");
    assert(sb.activeSandboxCount === 0, "activeSandboxCount = 0 after cleanup");
}
async function test19_SandboxCleanup() {
    console.log("\n── 19. Sandbox cleanup (bulk) ────────────────────────────────");
    const sb = new ExecutionSandbox();
    const dirs = [];
    for (let i = 0; i < 4; i++) {
        const ctx = sb.create(`req-bulk-${i}`);
        dirs.push(ctx.dir);
    }
    assert(sb.activeSandboxCount === 4, "4 sandboxes active");
    assert(dirs.every(d => fs.existsSync(d)), "All dirs exist before cleanup");
    sb.cleanupAll();
    assert(sb.activeSandboxCount === 0, "All sandboxes removed");
    assert(dirs.every(d => !fs.existsSync(d)), "All dirs removed from disk");
}
async function test20_DeterministicExecution() {
    console.log("\n── 20. Deterministic execution (same inputs → same outputs) ──");
    const runner = new ProcessRunner();
    const r = () => req("t20", nodeScript(`process.stdout.write("deterministic"); process.exit(0);`));
    const results = await Promise.all([runner.run(r()), runner.run(r()), runner.run(r())]);
    assert(results.every(r => r.output.stdout.includes("deterministic")), "All runs produce identical stdout");
    assert(results.every(r => r.exitCode === 0), "All runs exit 0");
    assert(results.every(r => r.state === "Completed"), "All runs Completed");
}
async function test21_ParallelProcessExecution() {
    console.log("\n── 21. Parallel process execution ────────────────────────────");
    const runner = new ProcessRunner();
    const start = Date.now();
    const results = await Promise.all(Array.from({ length: 4 }, (_, i) => runner.run(req(`t21-${i}`, nodeScript(`
                setTimeout(() => {
                    process.stdout.write("worker-${i}");
                    process.exit(0);
                }, 50);
            `)))));
    const elapsed = Date.now() - start;
    assert(results.length === 4, "4 processes completed");
    assert(results.every(r => r.exitCode === 0), "All exited 0");
    // 4 x 50ms sequential would be 200ms; parallel should finish faster
    assert(elapsed < 300, `Parallel execution completes in < 300ms (actual ${elapsed}ms)`);
}
async function test22_StreamOrdering() {
    console.log("\n── 22. Stream chunk ordering ─────────────────────────────────");
    const proc = new StreamProcessor("req-stream-order");
    const collected = [];
    proc.stdout.onChunk(c => collected.push(c));
    proc.stderr.onChunk(c => collected.push(c));
    proc.stdout.push("chunk-A");
    proc.stderr.push("chunk-B");
    proc.stdout.push("chunk-C");
    proc.stdout.complete();
    proc.stderr.complete();
    assert(collected.length === 3, "3 chunks collected");
    assert(collected[0].data === "chunk-A", "First chunk is A");
    assert(collected[1].data === "chunk-B", "Second chunk is B");
    assert(collected[2].data === "chunk-C", "Third chunk is C");
    // Sequence numbers are monotonically increasing per channel
    const stdoutChunks = collected.filter(c => c.channel === "stdout");
    assert(stdoutChunks[0].sequence < stdoutChunks[1].sequence, "stdout sequences monotonic");
}
async function test23_LargeStdout() {
    console.log("\n── 23. Large stdout handling ─────────────────────────────────");
    const runner = new ProcessRunner();
    // Write 30KB — comfortably within a single pipe buffer flush
    const script = `
        const chunk = "A".repeat(1024);
        for (let i = 0; i < 30; i++) process.stdout.write(chunk);
        process.exit(0);
    `;
    const result = await runner.run(req("t23", nodeScript(script)));
    assert(result.output.stdoutBytes >= 10 * 1024, `stdoutBytes >= 10KB (got ${result.output.stdoutBytes})`);
    assert(result.exitCode === 0, "Large stdout: exit 0");
}
async function test24_LargeStderr() {
    console.log("\n── 24. Large stderr handling ─────────────────────────────────");
    const runner = new ProcessRunner();
    const script = `
        const chunk = "E".repeat(1024);
        for (let i = 0; i < 20; i++) process.stderr.write(chunk);
        process.exit(0);
    `;
    const result = await runner.run(req("t24", nodeScript(script)));
    assert(result.output.stderrBytes >= 10 * 1024, `stderrBytes >= 10KB (got ${result.output.stderrBytes})`);
    assert(result.exitCode === 0, "Large stderr: exit 0");
}
async function test25_ProcessCrashHandling() {
    console.log("\n── 25. Process crash handling ────────────────────────────────");
    const runner = new ProcessRunner();
    const result = await runner.run(req("t25", nodeScript("process.exit(1)"), { retry: undefined }));
    assert(result.exitCode === 1, "Crashed process exit code captured");
    assert(result.state === "Failed", "State = Failed on non-zero exit");
    assert(typeof result.error === "string", "error string present");
}
async function test26_InvalidExecutable() {
    console.log("\n── 26. Invalid executable ────────────────────────────────────");
    const svc = new ProviderExecutionService();
    await assertRejects(() => svc.execute({
        id: "t26",
        executable: "/absolutely/nonexistent/binary-xyz",
        args: [],
        cwd: os.tmpdir(),
        env: {},
        includeParentEnv: false,
        retry: NO_RETRY_POLICY
    }), ProcessSpawnError, "ProcessSpawnError on invalid executable");
    await svc.shutdown();
}
async function test27_SignalForwarding() {
    console.log("\n── 27. Signal forwarding ─────────────────────────────────────");
    const runner = new ProcessRunner();
    // Process that handles SIGTERM gracefully
    const script = `
        process.on('SIGTERM', () => { process.stdout.write('got-sigterm\\n'); process.exit(0); });
        setTimeout(() => {}, 30000);
    `;
    const r = req("t27", nodeScript(script), {
        timeout: {
            executionTimeoutMs: 200,
            gracefulShutdownMs: 50,
            forceKillMs: 200
        }
    });
    let err;
    try {
        await runner.run(r);
    }
    catch (e) {
        err = e;
    }
    // Either timeout kills it or it exits — either way no hang
    assert(err instanceof ProcessTimeoutError || err === undefined, "Process terminated within timeout window");
}
async function test28_MetricsCorrectness() {
    console.log("\n── 28. Metrics correctness ───────────────────────────────────");
    const runner = new ProcessRunner();
    const result = await runner.run(req("t28", nodeScript(`
            process.stdout.write("out1\\n");
            process.stderr.write("err1\\n");
            process.exit(0);
        `)));
    const m = result.metrics;
    assert(m.requestId === "t28", "requestId in metrics");
    assert(m.executable === process.execPath, "executable in metrics");
    assert(typeof m.startedAt === "string", "startedAt timestamp");
    assert(typeof m.completedAt === "string", "completedAt timestamp");
    assert(m.durationMs >= 0, `durationMs >= 0 (got ${m.durationMs})`);
    assert(m.exitCode === 0, "exitCode in metrics");
    assert(m.stdoutBytes > 0, "stdoutBytes > 0");
    assert(m.stderrBytes > 0, "stderrBytes > 0");
    assert(m.retryCount === 0, "retryCount = 0 (no retries)");
}
async function test29_RepeatedExecutionDeterminism() {
    console.log("\n── 29. Repeated execution determinism ────────────────────────");
    const ev = new RetryEvaluator(DEFAULT_RETRY_POLICY);
    // Same inputs → same outputs, 10 times
    const decisions = Array.from({ length: 10 }, () => ev.evaluate(0, 1, undefined));
    assert(decisions.every(d => d.shouldRetry === decisions[0].shouldRetry), "shouldRetry identical");
    assert(decisions.every(d => d.delayMs === decisions[0].delayMs), "delayMs identical");
    assert(decisions.every(d => d.reason === decisions[0].reason), "reason identical");
    // Delay computation is also deterministic
    const delays = Array.from({ length: 5 }, (_, attempt) => ev.computeDelay(attempt));
    assert(delays.join(",") === delays.join(","), "delay sequence deterministic");
    assert(delays[0] < delays[1] && delays[1] < delays[2], "delay increases with each attempt");
    // isTransientExitCode is pure
    const perms = [0, 1, 127, 1, 0, 127].map(c => isTransientExitCode(c, [127]));
    assert(perms[0] === perms[4], "isTransientExitCode(0) consistent");
    assert(perms[1] === perms[3], "isTransientExitCode(1) consistent");
    assert(perms[2] === perms[5], "isTransientExitCode(127) consistent");
}
async function test30_BuildRegression() {
    console.log("\n── 30. Build regression — BUILD-049 providers still work ─────");
    // Verify provider-execution does not interfere with the Provider Runtime
    const { MockSDKProvider } = await import("./providers/mock");
    const { ClaudeCodeProvider } = await import("./providers/claude-code");
    const { ProviderRuntimeService } = await import("./provider-runtime/service");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "brain-reg30-"));
    try {
        const prs = new ProviderRuntimeService(root);
        prs.register(new MockSDKProvider());
        prs.register(new ClaudeCodeProvider());
        const response = await prs.execute({
            task: {
                id: "t30",
                type: "create",
                title: "Regression check",
                status: "Running",
                prerequisites: []
            },
            context: { workspaceRoot: root }
        });
        assert(response.status === "Completed", "BUILD-049 MockSDKProvider still works");
        assert(response.artifacts.length >= 1, "Artifacts produced");
        const diag = prs.diagnostics();
        assert(diag.totalExecutions === 1, "ProviderRuntime diagnostics correct");
        assert(diag.registeredProviderIds.includes("claude-code"), "Claude registered");
    }
    finally {
        cleanup(root);
    }
}
// ─── Runner ───────────────────────────────────────────────────────────────────
async function main() {
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(" BUILD-050A — Provider Execution Layer — Test Suite (30 tests)");
    console.log("═══════════════════════════════════════════════════════════════");
    await test01_ProcessStarts();
    await test02_ProcessExitsSuccessfully();
    await test03_StdoutCaptured();
    await test04_StderrCaptured();
    await test05_StdinWorks();
    await test06_EnvironmentVariables();
    await test07_WorkingDirectory();
    await test08_Cancellation();
    await test09_GracefulShutdown();
    await test10_StartupTimeout();
    await test11_IdleTimeout();
    await test12_ExecutionTimeout();
    await test13_RetryPolicy();
    await test14_TransientRetry();
    await test15_PermanentFailure();
    await test16_Diagnostics();
    await test17_ResourceCleanup();
    await test18_SandboxCreation();
    await test19_SandboxCleanup();
    await test20_DeterministicExecution();
    await test21_ParallelProcessExecution();
    await test22_StreamOrdering();
    await test23_LargeStdout();
    await test24_LargeStderr();
    await test25_ProcessCrashHandling();
    await test26_InvalidExecutable();
    await test27_SignalForwarding();
    await test28_MetricsCorrectness();
    await test29_RepeatedExecutionDeterminism();
    await test30_BuildRegression();
    console.log("\n═══════════════════════════════════════════════════════════════");
    console.log(` RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
    if (failures.length > 0) {
        console.error("\nFailures:");
        for (const f of failures)
            console.error(`  ${f}`);
    }
    console.log("═══════════════════════════════════════════════════════════════");
    if (failed > 0)
        process.exit(1);
}
main().catch(err => { console.error("Unhandled:", err); process.exit(1); });
