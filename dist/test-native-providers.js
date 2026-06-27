// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050C — Remaining Native Providers — Verification Suite
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import os from "os";
import { CodexProvider } from "./providers/codex/provider.js";
import { GeminiCLIProvider } from "./providers/gemini-cli/provider.js";
import { OllamaProvider } from "./providers/ollama/provider.js";
import { AiderProvider } from "./providers/aider/provider.js";
import { OpenCodeProvider } from "./providers/opencode/provider.js";
import { WorkspaceEngine } from "./workspace/workspace-engine.js";
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
    return fs.mkdtempSync(path.join(os.tmpdir(), "brain-providers-test-"));
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
function writeMockBinary(tempDir, providerName, binName, behavior) {
    const binPath = path.join(tempDir, `mock-${binName}-${behavior}`);
    let content = `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);

if (args.includes('--version')) {
    console.log('${providerName} version 1.2.3');
    process.exit(0);
}

if (args.includes('status') || args.includes('auth')) {
    console.log('Logged in/authenticated successfully');
    process.exit(0);
}

if (args.includes('list')) {
    console.log('model-a\\nmodel-b');
    process.exit(0);
}
`;
    if (behavior === "normal") {
        content += `
console.log('Reasoning context...');
console.log('---START_ARTIFACTS---');
console.log(JSON.stringify({
    artifacts: [{
        id: '${binName}-art-1',
        type: 'code',
        path: 'output.txt',
        content: 'hello world from mock ${providerName}'
    }]
}));
console.log('---END_ARTIFACTS---');
`;
    }
    else if (behavior === "stream") {
        content += `
process.stdout.write('Reasoning token from ${providerName}\\n');
setTimeout(() => {
    process.stderr.write('Warning log line from ${providerName}\\n');
    setTimeout(() => {
        console.log('---START_ARTIFACTS---');
        console.log(JSON.stringify({
            artifacts: [{
                id: 'stream-art-${binName}',
                type: 'code',
                path: 'stream.txt',
                content: 'streamed content from ${providerName}'
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
console.error('Transient execution error');
process.exit(1);
`;
    }
    else if (behavior === "fail_permanent") {
        content += `
console.error('Permanent command/execution error');
process.exit(127);
`;
    }
    else if (behavior === "timeout") {
        content += `
setTimeout(() => {}, 999999);
`;
    }
    else if (behavior === "cancel") {
        content += `
setInterval(() => {
    console.log('running loop...');
}, 5);
`;
    }
    fs.writeFileSync(binPath, content, { mode: 0o755 });
    return binPath;
}
const PROVIDERS_TO_TEST = [
    {
        id: "codex",
        name: "Codex",
        envVar: "CODEX_BIN",
        binName: "codex",
        ctor: CodexProvider,
        supportsStreaming: true,
        expectedModel: "o3"
    },
    {
        id: "gemini-cli",
        name: "Gemini CLI",
        envVar: "GEMINI_BIN",
        binName: "gemini",
        ctor: GeminiCLIProvider,
        supportsStreaming: true,
        expectedModel: "gemini-2.5-pro"
    },
    {
        id: "ollama",
        name: "Ollama",
        envVar: "OLLAMA_BIN",
        binName: "ollama",
        ctor: OllamaProvider,
        supportsStreaming: true,
        expectedModel: "qwen2.5-coder"
    },
    {
        id: "aider",
        name: "Aider",
        envVar: "AIDER_BIN",
        binName: "aider",
        ctor: AiderProvider,
        supportsStreaming: false,
        expectedModel: "aider-claude-sonnet"
    },
    {
        id: "opencode",
        name: "OpenCode",
        envVar: "OPENCODE_BIN",
        binName: "opencode",
        ctor: OpenCodeProvider,
        supportsStreaming: true,
        expectedModel: "opencode-latest"
    }
];
async function runTestsForProvider(cfg) {
    console.log(`\n===============================================================`);
    console.log(` TESTING PROVIDER: ${cfg.name} (${cfg.id})`);
    console.log(`===============================================================`);
    // 1. Metadata and Profile verification
    console.log(`\n── [${cfg.name}] 01. Metadata and Profile ──────────────────`);
    const provider = new cfg.ctor();
    assert(provider.id === cfg.id, `ID matches: ${cfg.id}`);
    const metadata = provider.metadata();
    assert(metadata.id === cfg.id, `Metadata ID matches: ${cfg.id}`);
    assert(metadata.displayName.length > 0, "Display name is non-empty");
    assert(metadata.version === "1.0.0", "Version is 1.0.0");
    assert(metadata.defaultModel === cfg.expectedModel, `Default model is ${cfg.expectedModel}`);
    const profile = provider.profile();
    assert(profile.metadata.id === cfg.id, "Profile embeds metadata");
    assert(profile.limits.maxContextTokens > 0, "Max context tokens is defined");
    assert(profile.limits.supportsCancellation === true, "Cancellation is supported");
    assert(profile.limits.supportsStreaming === cfg.supportsStreaming, `Streaming support is ${cfg.supportsStreaming}`);
    // 2. Health and version checks
    console.log(`\n── [${cfg.name}] 02. Health & Version ─────────────────────`);
    const tempDir = makeTempDir();
    try {
        const mockPath = writeMockBinary(tempDir, cfg.name, cfg.binName, "normal");
        process.env[cfg.envVar] = mockPath;
        const health = await provider.health();
        assert(health.installed === true, "Health installed is true when binary exists");
        assert(health.version === "1.2.3", `Health reports version 1.2.3 (got ${health.version})`);
        assert(health.status === "Healthy" || health.status === "Degraded", `Health status is valid: ${health.status}`);
    }
    finally {
        delete process.env[cfg.envVar];
        cleanup(tempDir);
    }
    // 3. Execution & Response Parsing
    console.log(`\n── [${cfg.name}] 03. Execution and Response Parsing ────────`);
    const tempDir2 = makeTempDir();
    try {
        const mockPath = writeMockBinary(tempDir2, cfg.name, cfg.binName, "normal");
        process.env[cfg.envVar] = mockPath;
        const task = makeTask(`t-exec-${cfg.id}`);
        const context = { workspaceRoot: tempDir2 };
        const response = await provider.execute(task, context, () => { });
        assert(response.status === "Completed", "Execution completed successfully");
        assert(response.artifacts.length === 1, "One artifact returned");
        assert(response.artifacts[0].id === `${cfg.binName}-art-1`, "Artifact has correct ID");
        assert(response.artifacts[0].content === `hello world from mock ${cfg.name}`, "Artifact content matches");
        assert(response.metrics.artifactsProduced === 1, "Metrics matches artifact count");
        assert(response.metrics.retries === 0, "Metrics reports zero retries");
    }
    finally {
        delete process.env[cfg.envVar];
        cleanup(tempDir2);
    }
    // 4. Streaming (if supported)
    if (cfg.supportsStreaming) {
        console.log(`\n── [${cfg.name}] 04. Streaming Events ─────────────────────`);
        const tempDir3 = makeTempDir();
        try {
            const mockPath = writeMockBinary(tempDir3, cfg.name, cfg.binName, "stream");
            process.env[cfg.envVar] = mockPath;
            const task = makeTask(`t-stream-${cfg.id}`);
            const context = { workspaceRoot: tempDir3 };
            const streamEvents = [];
            const onStream = (event) => {
                streamEvents.push(event);
            };
            const response = await provider.execute(task, context, () => { }, onStream);
            assert(response.status === "Completed", "Streaming execution completed");
            const tokens = streamEvents.filter(e => e.type === "Token");
            const logs = streamEvents.filter(e => e.type === "Log");
            assert(tokens.length >= 1, "Token events were received");
            assert(tokens.some(t => t.token?.includes(`Reasoning token from ${cfg.name}`)), "Expected token content received");
            assert(logs.length >= 1, "Log events were received");
            assert(logs.some(l => l.message?.includes(`Warning log line from ${cfg.name}`)), "Expected log content received");
        }
        finally {
            delete process.env[cfg.envVar];
            cleanup(tempDir3);
        }
    }
    // 5. Transient Failures and Retries
    console.log(`\n── [${cfg.name}] 05. Transient Failures & Retries ──────────`);
    const tempDir4 = makeTempDir();
    try {
        const mockPath = writeMockBinary(tempDir4, cfg.name, cfg.binName, "fail_transient");
        process.env[cfg.envVar] = mockPath;
        const task = makeTask(`t-transient-${cfg.id}`);
        const context = { workspaceRoot: tempDir4 };
        let threw = false;
        try {
            await provider.execute(task, context, () => { });
        }
        catch (err) {
            threw = true;
            assert(err.retryable === true, "Transient errors are retryable (throw TransientProviderError)");
            assert(err.message.includes("exit code: 1"), "Error contains exit code context");
        }
        assert(threw, "Execution throws on transient failure");
    }
    finally {
        delete process.env[cfg.envVar];
        cleanup(tempDir4);
    }
    // 6. Permanent Failures
    console.log(`\n── [${cfg.name}] 06. Permanent Failures ───────────────────`);
    const tempDir5 = makeTempDir();
    try {
        const mockPath = writeMockBinary(tempDir5, cfg.name, cfg.binName, "fail_permanent");
        process.env[cfg.envVar] = mockPath;
        const task = makeTask(`t-permanent-${cfg.id}`);
        const context = { workspaceRoot: tempDir5 };
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
        delete process.env[cfg.envVar];
        cleanup(tempDir5);
    }
    // 7. Execution Timeout
    console.log(`\n── [${cfg.name}] 07. Timeout Policies ─────────────────────`);
    const tempDir6 = makeTempDir();
    try {
        const mockPath = writeMockBinary(tempDir6, cfg.name, cfg.binName, "timeout");
        process.env[cfg.envVar] = mockPath;
        const task = makeTask(`t-timeout-${cfg.id}`);
        const context = {
            workspaceRoot: tempDir6,
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
        delete process.env[cfg.envVar];
        cleanup(tempDir6);
    }
    // 8. Cancellation Support
    console.log(`\n── [${cfg.name}] 08. Cancellation ─────────────────────────`);
    const tempDir7 = makeTempDir();
    try {
        const mockPath = writeMockBinary(tempDir7, cfg.name, cfg.binName, "cancel");
        process.env[cfg.envVar] = mockPath;
        const task = makeTask(`t-cancel-${cfg.id}`);
        const context = { workspaceRoot: tempDir7 };
        const promise = provider.execute(task, context, () => { });
        setTimeout(() => {
            provider.cancel(`t-cancel-${cfg.id}`);
        }, 50);
        let threw = false;
        try {
            await promise;
        }
        catch (err) {
            threw = true;
            assert(err.retryable === true, "Cancelled process throws TransientProviderError");
            assert(err.message.includes("cancelled") || err.message.includes("killed") || err.message.includes("SIG"), "Error reflects cancellation status");
        }
        assert(threw, "Cancellation throws exception");
    }
    finally {
        delete process.env[cfg.envVar];
        cleanup(tempDir7);
    }
    // 9. WorkspaceEngine Integration Compatibility
    console.log(`\n── [${cfg.name}] 09. WorkspaceEngine Compatibility ───────`);
    const tempDir8 = makeTempDir();
    try {
        const mockPath = writeMockBinary(tempDir8, cfg.name, cfg.binName, "normal");
        process.env[cfg.envVar] = mockPath;
        const task = makeTask(`t-ws-${cfg.id}`);
        task.file = "output.txt";
        const context = { workspaceRoot: tempDir8 };
        const response = await provider.execute(task, context, () => { });
        assert(response.status === "Completed", "Execution completed");
        const wsEngine = new WorkspaceEngine({ workspaceRoot: tempDir8 });
        const tx = wsEngine.beginTransaction();
        const applicable = response.artifacts.map((art) => ({
            id: art.id,
            taskId: task.id,
            type: art.type,
            path: art.path,
            content: art.content
        }));
        const result = await wsEngine.applyArtifacts(applicable, tx.id);
        assert(result.success === true, "WorkspaceEngine applied artifacts successfully");
        const targetFilePath = path.join(tempDir8, "output.txt");
        assert(fs.existsSync(targetFilePath), "Artifact applied to disk");
        assert(fs.readFileSync(targetFilePath, "utf8") === `hello world from mock ${cfg.name}`, "Disk content matches");
    }
    finally {
        delete process.env[cfg.envVar];
        cleanup(tempDir8);
    }
}
async function main() {
    console.log("===============================================================");
    console.log(" BUILD-050C — Remaining Native Providers Verification Suite");
    console.log("===============================================================");
    for (const cfg of PROVIDERS_TO_TEST) {
        try {
            await runTestsForProvider(cfg);
        }
        catch (e) {
            console.error(`Uncaught exception testing provider ${cfg.name}:`, e);
            failed++;
        }
    }
    console.log("\n===============================================================");
    console.log(` RESULTS: ${passed} passed, ${failed} failed`);
    console.log("===============================================================");
    if (failed > 0) {
        process.exit(1);
    }
}
main();
