// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050B — Claude Code Provider — Verification Suite
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import os from "os";
import { ClaudeCodeProvider, resolveClaudePath } from "./providers/claude-code/provider";
import { buildPrompt } from "./providers/claude-code/prompt-builder";
import { parseResponse } from "./providers/claude-code/response-parser";
import { WorkspaceEngine } from "./workspace/workspace-engine";
import { MockSDKProvider } from "./providers/mock";
let passed = 0;
let failed = 0;
const errors = [];
function assert(condition, message) {
    if (!condition) {
        failed++;
        errors.push(`FAIL: ${message}`);
        console.error(`  ✗ FAIL: ${message}`);
    }
    else {
        passed++;
        console.log(`  ✓ ${message}`);
    }
}
function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "brain-claude-test-"));
}
function cleanup(dir) {
    try {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    catch { }
}
function makeTask(id, type = "create") {
    return {
        id,
        type: type,
        title: `Test task ${id}`,
        status: "Running",
        prerequisites: []
    };
}
// Write a custom mock CLI binary script for a given scenario
function writeMockBinary(tempDir, behavior) {
    const binPath = path.join(tempDir, `mock-claude-${behavior}`);
    let content = `#!/usr/bin/env node
const args = process.argv.slice(2);

if (args.includes('--version')) {
    console.log('claude version 1.2.3');
    process.exit(0);
}

if (args.includes('status')) {
    console.log('Logged in as test-user@anthropic.com');
    process.exit(0);
}

const prompt = args[0] || '';
`;
    if (behavior === "normal") {
        content += `
console.log('Doing some reasoning...');
console.log('---START_ARTIFACTS---');
console.log(JSON.stringify({
    artifacts: [{
        id: 'claude-art-1',
        type: 'code',
        path: 'output.txt',
        content: 'hello world from real spawned process'
    }]
}));
console.log('---END_ARTIFACTS---');
`;
    }
    else if (behavior === "stream") {
        content += `
process.stdout.write('Reasoning token\\n');
setTimeout(() => {
    process.stderr.write('Warning log line\\n');
    setTimeout(() => {
        console.log('---START_ARTIFACTS---');
        console.log(JSON.stringify({
            artifacts: [{
                id: 'stream-art',
                type: 'code',
                path: 'stream.txt',
                content: 'stream data'
            }]
        }));
        console.log('---END_ARTIFACTS---');
        process.exit(0);
    }, 10);
}, 10);
`;
    }
    else if (behavior === "fail_transient") {
        content += `
console.error('Transient stderr error');
process.exit(1);
`;
    }
    else if (behavior === "fail_permanent") {
        content += `
console.error('Command not found/permanent error');
process.exit(127);
`;
    }
    else if (behavior === "timeout") {
        content += `
// Hang indefinitely to trigger timeout
setTimeout(() => {}, 999999);
`;
    }
    else if (behavior === "cancel") {
        content += `
// Run indefinitely until signal
setInterval(() => {
    console.log('running...');
}, 5);
`;
    }
    else if (behavior === "session") {
        content += `
const sessionVal = process.env.CLAUDE_SESSION_ID || 'no-session';
console.log('Session: ' + sessionVal);
console.log('---START_ARTIFACTS---');
console.log(JSON.stringify({
    artifacts: [{
        id: 'session-art',
        type: 'code',
        path: 'session.txt',
        content: sessionVal
    }]
}));
console.log('---END_ARTIFACTS---');
`;
    }
    fs.writeFileSync(binPath, content, { mode: 0o755 });
    return binPath;
}
// ─── Tests ────────────────────────────────────────────────────────────────────
async function test01_ExecutableAndVersion() {
    console.log("\n── 01. Executable and Version Detection ──────────────────────");
    const tempDir = makeTempDir();
    try {
        const mockPath = writeMockBinary(tempDir, "normal");
        process.env.CLAUDE_BIN = mockPath;
        const resolved = resolveClaudePath();
        assert(resolved === mockPath, "resolveClaudePath resolves CLAUDE_BIN env var");
        const provider = new ClaudeCodeProvider();
        const health = await provider.health();
        assert(health.installed === true, "Health installed is true when version call succeeds");
        assert(health.version === "1.2.3", `Health detects version 1.2.3 (got ${health.version})`);
    }
    finally {
        cleanup(tempDir);
        delete process.env.CLAUDE_BIN;
    }
}
async function test02_AuthenticationDetection() {
    console.log("\n── 02. Authentication Status Detection ───────────────────────");
    const tempDir = makeTempDir();
    try {
        const mockPath = writeMockBinary(tempDir, "normal");
        process.env.CLAUDE_BIN = mockPath;
        const provider = new ClaudeCodeProvider();
        const health = await provider.health();
        assert(health.authenticated === true, "Health status authenticates logged-in users");
        assert(health.status === "Healthy", `Health report status is Healthy (got ${health.status})`);
    }
    finally {
        cleanup(tempDir);
        delete process.env.CLAUDE_BIN;
    }
}
async function test03_PromptBuilder() {
    console.log("\n── 03. Prompt Construction ───────────────────────────────────");
    const task = makeTask("t-prompt", "modify");
    task.file = "src/main.ts";
    task.symbol = "myFunc";
    const context = {
        workspaceRoot: "/test-workspace",
        constraints: { minCpu: "2", maxMemory: "4GB" },
        rules: { style: "eslint", trailingComma: "all" },
        workspaceContext: { recentChanges: ["edited main.ts"] }
    };
    const prompt = buildPrompt({ task, context });
    assert(prompt.includes("t-prompt"), "Prompt includes task ID");
    assert(prompt.includes("src/main.ts"), "Prompt includes target file");
    assert(prompt.includes("myFunc"), "Prompt includes target symbol");
    assert(prompt.includes("minCpu: 2"), "Prompt includes engineering constraints");
    assert(prompt.includes("eslint"), "Prompt includes workspace rules");
    assert(prompt.includes("---START_ARTIFACTS---"), "Prompt contains START_ARTIFACTS instructions");
    assert(prompt.includes("MUST NEVER modify any files on the filesystem directly"), "Prompt enforces workspace safety");
}
async function test04_ExecutionAndResponseParsing() {
    console.log("\n── 04. Execution and Response Parsing ────────────────────────");
    const tempDir = makeTempDir();
    try {
        const mockPath = writeMockBinary(tempDir, "normal");
        process.env.CLAUDE_BIN = mockPath;
        const provider = new ClaudeCodeProvider();
        const task = makeTask("t-exec");
        const context = { workspaceRoot: tempDir };
        const response = await provider.execute(task, context, () => { });
        assert(response.status === "Completed", "Execution exits with Completed status");
        assert(response.artifacts.length === 1, "One artifact returned");
        assert(response.artifacts[0].id === "claude-art-1", "Artifact has expected ID");
        assert(response.artifacts[0].content === "hello world from real spawned process", "Artifact content matches");
        assert(response.artifacts[0].path === "output.txt", "Artifact path matches");
        assert(response.metrics.artifactsProduced === 1, "Metrics reports correct artifact count");
        assert(response.metrics.retries === 0, "Metrics reports zero retries");
    }
    finally {
        cleanup(tempDir);
        delete process.env.CLAUDE_BIN;
    }
}
async function test05_StreamingEvents() {
    console.log("\n── 05. Streaming Event Interception ──────────────────────────");
    const tempDir = makeTempDir();
    try {
        const mockPath = writeMockBinary(tempDir, "stream");
        process.env.CLAUDE_BIN = mockPath;
        const provider = new ClaudeCodeProvider();
        const task = makeTask("t-stream");
        const context = { workspaceRoot: tempDir };
        const streamEvents = [];
        const onStream = (event) => {
            streamEvents.push(event);
        };
        const response = await provider.execute(task, context, () => { }, onStream);
        assert(response.status === "Completed", "Stream execution completed");
        const tokens = streamEvents.filter(e => e.type === "Token");
        const logs = streamEvents.filter(e => e.type === "Log");
        assert(tokens.length >= 1, "Token events received");
        assert(tokens.some(t => t.token?.includes("Reasoning token")), "Expected token content received");
        assert(logs.length >= 1, "Log events received from stderr");
        assert(logs.some(l => l.message?.includes("Warning log line")), "Expected log message received");
    }
    finally {
        cleanup(tempDir);
        delete process.env.CLAUDE_BIN;
    }
}
async function test06_WorkspaceEngineCompatibility() {
    console.log("\n── 06. WorkspaceEngine Compatibility ─────────────────────────");
    const tempDir = makeTempDir();
    try {
        const mockPath = writeMockBinary(tempDir, "normal");
        process.env.CLAUDE_BIN = mockPath;
        const provider = new ClaudeCodeProvider();
        const task = makeTask("t-ws");
        task.file = "output.txt";
        const context = { workspaceRoot: tempDir };
        const response = await provider.execute(task, context, () => { });
        assert(response.status === "Completed", "Execution completed");
        // Set up real WorkspaceEngine and apply artifacts
        const wsEngine = new WorkspaceEngine({ workspaceRoot: tempDir });
        const tx = wsEngine.beginTransaction();
        const applicable = response.artifacts.map(art => ({
            id: art.id,
            taskId: task.id,
            type: art.type,
            path: art.path,
            content: art.content
        }));
        const result = await wsEngine.applyArtifacts(applicable, tx.id);
        assert(result.success === true, "WorkspaceEngine applied artifacts successfully");
        const targetFilePath = path.join(tempDir, "output.txt");
        assert(fs.existsSync(targetFilePath), "Artifact applied to disk");
        assert(fs.readFileSync(targetFilePath, "utf8") === "hello world from real spawned process", "Disk content matches");
    }
    finally {
        cleanup(tempDir);
        delete process.env.CLAUDE_BIN;
    }
}
async function test07_RetryOnTransientFailure() {
    console.log("\n── 07. Transient Failure Retry ───────────────────────────────");
    const tempDir = makeTempDir();
    try {
        const mockPath = writeMockBinary(tempDir, "fail_transient");
        process.env.CLAUDE_BIN = mockPath;
        const provider = new ClaudeCodeProvider();
        const task = makeTask("t-transient");
        const context = { workspaceRoot: tempDir };
        let threw = false;
        try {
            await provider.execute(task, context, () => { });
        }
        catch (err) {
            threw = true;
            assert(err.retryable === true, "Transient errors are retryable (throw TransientProviderError)");
            assert(err.message.includes("exit code: 1"), "Error contains stdout/stderr failure context");
        }
        assert(threw, "Execution throws on transient failure");
    }
    finally {
        cleanup(tempDir);
        delete process.env.CLAUDE_BIN;
    }
}
async function test08_PermanentFailureNoRetry() {
    console.log("\n── 08. Permanent Failure No Retry ────────────────────────────");
    const tempDir = makeTempDir();
    try {
        const mockPath = writeMockBinary(tempDir, "fail_permanent");
        process.env.CLAUDE_BIN = mockPath;
        const provider = new ClaudeCodeProvider();
        const task = makeTask("t-permanent");
        const context = { workspaceRoot: tempDir };
        let threw = false;
        try {
            await provider.execute(task, context, () => { });
        }
        catch (err) {
            threw = true;
            assert(err.retryable === false, "Permanent errors are not retryable (throw PermanentProviderError)");
            assert(err.message.includes("exit code: 127") || err.message.includes("127"), "Error reflects permanent code 127");
        }
        assert(threw, "Execution throws on permanent failure");
    }
    finally {
        cleanup(tempDir);
        delete process.env.CLAUDE_BIN;
    }
}
async function test09_ExecutionTimeout() {
    console.log("\n── 09. Execution Timeout ─────────────────────────────────────");
    const tempDir = makeTempDir();
    try {
        const mockPath = writeMockBinary(tempDir, "timeout");
        process.env.CLAUDE_BIN = mockPath;
        const provider = new ClaudeCodeProvider();
        const task = makeTask("t-timeout");
        const context = {
            workspaceRoot: tempDir,
            timeout: {
                startupTimeoutMs: 50,
                idleTimeoutMs: 50,
                executionTimeoutMs: 100 // force timeout quickly
            }
        };
        let threw = false;
        try {
            await provider.execute(task, context, () => { });
        }
        catch (err) {
            threw = true;
            assert(err.retryable === true, "Timeout throws retryable TransientProviderError");
            assert(err.message.toLowerCase().includes("timeout"), "Error message contains timeout description");
        }
        assert(threw, "Timeout results in exception");
    }
    finally {
        cleanup(tempDir);
        delete process.env.CLAUDE_BIN;
    }
}
async function test10_Cancellation() {
    console.log("\n── 10. Cancellation Support ──────────────────────────────────");
    const tempDir = makeTempDir();
    try {
        const mockPath = writeMockBinary(tempDir, "cancel");
        process.env.CLAUDE_BIN = mockPath;
        const provider = new ClaudeCodeProvider();
        const task = makeTask("t-cancel");
        const context = { workspaceRoot: tempDir };
        // Run execution in background, then cancel it after 100ms
        const promise = provider.execute(task, context, () => { });
        setTimeout(() => {
            provider.cancel("t-cancel");
        }, 50);
        let threw = false;
        try {
            await promise;
        }
        catch (err) {
            threw = true;
            console.error("CANCELLATION TEST CAUGHT ERROR:", err);
            assert(err.retryable === true, "Cancelled process throws TransientProviderError");
            assert(err.message.includes("cancelled") || err.message.includes("killed") || err.message.includes("SIG"), "Error reflects cancellation status");
        }
        assert(threw, "Cancellation throws exception");
    }
    finally {
        cleanup(tempDir);
        delete process.env.CLAUDE_BIN;
    }
}
async function test11_SessionSupport() {
    console.log("\n── 11. Session Support ───────────────────────────────────────");
    const tempDir = makeTempDir();
    try {
        const mockPath = writeMockBinary(tempDir, "session");
        process.env.CLAUDE_BIN = mockPath;
        const provider = new ClaudeCodeProvider();
        const task = makeTask("t-sess");
        const context = { workspaceRoot: tempDir, sessionId: "session-999" };
        const response = await provider.execute(task, context, () => { });
        assert(response.status === "Completed", "Session execution completes");
        assert(response.artifacts[0].content === "session-999", `Session ID passed in environment (got ${response.artifacts[0].content})`);
        assert(response.sessionId === "session-999", "Response returns correct sessionId");
    }
    finally {
        cleanup(tempDir);
        delete process.env.CLAUDE_BIN;
    }
}
async function test12_Diagnostics() {
    console.log("\n── 12. Execution Diagnostics ─────────────────────────────────");
    const tempDir = makeTempDir();
    try {
        const mockPath = writeMockBinary(tempDir, "normal");
        process.env.CLAUDE_BIN = mockPath;
        const provider = new ClaudeCodeProvider();
        const task = makeTask("t-diag");
        const context = { workspaceRoot: tempDir };
        const response = await provider.execute(task, context, () => { });
        assert(response.metrics.executionTime >= 0, "Execution time is valid");
        assert(response.model === "claude-sonnet-4-5", "Model tag present");
        assert(response.providerVersion === "1.0.0", "Provider version present");
    }
    finally {
        cleanup(tempDir);
        delete process.env.CLAUDE_BIN;
    }
}
async function test13_ResponseParserRobustness() {
    console.log("\n── 13. Response Parser Robustness ────────────────────────────");
    // Missing markers
    try {
        parseResponse("hello", "t1", "p1");
        assert(false, "Should throw on missing markers");
    }
    catch (err) {
        assert(err.message.includes("missing ---START_ARTIFACTS---"), "Missing start marker caught");
    }
    // Malformed JSON
    try {
        parseResponse("---START_ARTIFACTS---\n{bad\n---END_ARTIFACTS---", "t1", "p1");
        assert(false, "Should throw on malformed JSON");
    }
    catch (err) {
        assert(err.message.includes("Malformed JSON"), "Malformed JSON caught");
    }
    // Invalid schema
    try {
        parseResponse("---START_ARTIFACTS---\n{\"artifacts\": [{\"id\": 123}]}\n---END_ARTIFACTS---", "t1", "p1");
        assert(false, "Should throw on invalid type schema");
    }
    catch (err) {
        assert(err.message.includes("missing 'id'") || err.message.includes("not an object") || err.message.includes("invalid"), "Schema error caught");
    }
    // Valid parsing
    const stdout = `conversational text
    ---START_ARTIFACTS---
    {
      "artifacts": [
        {
          "id": "art-1",
          "type": "code",
          "path": "file.txt",
          "content": "abc"
        }
      ]
    }
    ---END_ARTIFACTS---
    extra explanation`;
    const parsed = parseResponse(stdout, "t-val", "claude-code");
    assert(parsed.length === 1, "Parses valid nested blocks correctly");
    assert(parsed[0].id === "art-1", "Parsed ID matches");
    assert(parsed[0].type === "code", "Parsed type matches");
    assert(parsed[0].content === "abc", "Parsed content matches");
    assert(parsed[0].taskId === "t-val", "Parsed taskId matches");
    assert(parsed[0].provider === "claude-code", "Parsed provider matches");
}
async function test14_RegressionMockSDKProvider() {
    console.log("\n── 14. Regression Compat — MockSDKProvider Still Works ──────");
    const mock = new MockSDKProvider();
    assert(mock.id === "mock-sdk-provider", "MockSDKProvider ID is mock-sdk-provider");
    const health = await mock.health();
    assert(health.status === "Healthy", "MockSDKProvider is Healthy");
    const response = await mock.execute(makeTask("t-mock"), { workspaceRoot: "/tmp" }, () => { });
    assert(response.status === "Completed", "MockSDKProvider executes correctly");
    assert(response.artifacts.length === 1, "MockSDKProvider produces an artifact");
}
// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log("===============================================================");
    console.log(" BUILD-050B — Claude Code Provider Verification Suite");
    console.log("===============================================================");
    try {
        await test01_ExecutableAndVersion();
        await test02_AuthenticationDetection();
        await test03_PromptBuilder();
        await test04_ExecutionAndResponseParsing();
        await test05_StreamingEvents();
        await test06_WorkspaceEngineCompatibility();
        await test07_RetryOnTransientFailure();
        await test08_PermanentFailureNoRetry();
        await test09_ExecutionTimeout();
        await test10_Cancellation();
        await test11_SessionSupport();
        await test12_Diagnostics();
        await test13_ResponseParserRobustness();
        await test14_RegressionMockSDKProvider();
    }
    catch (e) {
        console.error("Test execution interrupted by uncaught error:", e);
        failed++;
    }
    console.log("\n===============================================================");
    console.log(` RESULTS: ${passed} passed, ${failed} failed`);
    console.log("===============================================================");
    if (failed > 0) {
        process.exit(1);
    }
}
main();
