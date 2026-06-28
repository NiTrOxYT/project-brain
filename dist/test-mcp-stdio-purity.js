// ──────────────────────────────────────────────────────────────────────────────
// BUILD-067D — Regression Tests — MCP stdio Output Purity
//
// Verifies:
//   1. stdout contains only valid JSON-RPC messages
//   2. No ANSI escape sequences in stdout
//   3. No OSC terminal sequences in stdout
//   4. tools/list response includes inputSchema on every tool (MCP spec requirement)
//   5. All 6 required Brain tools are exposed
//   6. Full protocol sequence works cleanly (initialize → initialized → tools/list → tools/call)
// ──────────────────────────────────────────────────────────────────────────────
import { spawn } from "child_process";
import assert from "assert";
const BRAIN_CMD = "brain";
const BRAIN_ARGS = ["mcp", "stdio"];
function spawnBrain(cwd = "/tmp") {
    return spawn(BRAIN_CMD, BRAIN_ARGS, {
        cwd,
        env: { ...process.env }
    });
}
function collectStdio(child, durationMs) {
    return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        child.stdout?.on("data", (d) => { stdout += d.toString(); });
        child.stderr?.on("data", (d) => { stderr += d.toString(); });
        setTimeout(() => {
            child.kill("SIGKILL");
            resolve({ stdout, stderr });
        }, durationMs);
    });
}
function sendLine(child, obj) {
    child.stdin?.write(JSON.stringify(obj) + "\n");
}
const REQUIRED_TOOLS = [
    "brain.get_context",
    "brain.find_symbol",
    "brain.find_dependencies",
    "brain.search_memory",
    "brain.get_architecture",
    "brain.explain_file",
];
// ─────────────────────────────────────────────────────────────────────────────
async function testStdoutPurity() {
    const child = spawnBrain();
    setTimeout(() => sendLine(child, { jsonrpc: "2.0", method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {} }, id: 1 }), 100);
    setTimeout(() => sendLine(child, { jsonrpc: "2.0", method: "notifications/initialized", params: {} }), 300);
    setTimeout(() => sendLine(child, { jsonrpc: "2.0", method: "tools/list", params: {}, id: 2 }), 400);
    const { stdout } = await collectStdio(child, 3000);
    // No ANSI escape sequences
    assert.ok(!/\x1b/.test(stdout), `ANSI escape found in stdout: ${JSON.stringify(stdout.slice(0, 200))}`);
    // No OSC sequences
    assert.ok(!/\x1b\]/.test(stdout), `OSC sequence found in stdout`);
    // All non-empty lines must be valid JSON
    const nonJson = stdout.split("\n").filter(Boolean).filter(line => {
        try {
            JSON.parse(line);
            return false;
        }
        catch {
            return true;
        }
    });
    assert.strictEqual(nonJson.length, 0, `Non-JSON lines in stdout: ${JSON.stringify(nonJson)}`);
    // No control characters except those valid in JSON strings
    // (i.e. no bare 0x00–0x08 / 0x0B–0x1F / 0x7F outside JSON encoding)
    const stripped = stdout.replace(/\\[nrt\\"/]/g, ""); // remove JSON-encoded escapes
    const ctrlMatch = stripped.match(/[\x00-\x08\x0b-\x1f\x7f]/);
    assert.ok(!ctrlMatch, `Unexpected control character 0x${ctrlMatch?.[0]?.codePointAt(0)?.toString(16)} in stdout`);
}
async function testInputSchemaInToolsList() {
    const child = spawnBrain();
    setTimeout(() => sendLine(child, { jsonrpc: "2.0", method: "initialize",
        params: { protocolVersion: "2024-11-05" }, id: 0 }), 100);
    setTimeout(() => sendLine(child, { jsonrpc: "2.0", method: "tools/list", params: {}, id: 1 }), 300);
    const { stdout } = await collectStdio(child, 3000);
    const lines = stdout.split("\n").filter(Boolean);
    const listResp = lines
        .map(l => { try {
        return JSON.parse(l);
    }
    catch {
        return null;
    } })
        .find((r) => r && r.id === 1);
    assert.ok(listResp, `tools/list response not received. stdout=${JSON.stringify(stdout.slice(0, 300))}`);
    assert.ok(listResp.result?.tools, "tools/list result.tools missing");
    const tools = listResp.result.tools;
    for (const tool of tools) {
        assert.ok(tool.inputSchema !== undefined && tool.inputSchema !== null, `Tool ${tool.name} missing inputSchema field`);
        assert.strictEqual(tool.inputSchema.type, "object", `Tool ${tool.name} inputSchema.type must be "object", got "${tool.inputSchema.type}"`);
        assert.ok(tool.inputSchema.properties !== undefined, `Tool ${tool.name} inputSchema.properties missing`);
    }
}
async function testAllRequiredToolsExposed() {
    const child = spawnBrain();
    setTimeout(() => sendLine(child, { jsonrpc: "2.0", method: "initialize",
        params: { protocolVersion: "2024-11-05" }, id: 0 }), 100);
    setTimeout(() => sendLine(child, { jsonrpc: "2.0", method: "tools/list", params: {}, id: 1 }), 300);
    const { stdout } = await collectStdio(child, 3000);
    const listResp = stdout.split("\n").filter(Boolean)
        .map(l => { try {
        return JSON.parse(l);
    }
    catch {
        return null;
    } })
        .find((r) => r && r.id === 1);
    assert.ok(listResp?.result?.tools, "tools/list response missing");
    const toolNames = listResp.result.tools.map((t) => t.name);
    for (const required of REQUIRED_TOOLS) {
        assert.ok(toolNames.includes(required), `Required tool "${required}" not exposed`);
    }
}
async function testInitializeResponse() {
    const child = spawnBrain();
    setTimeout(() => sendLine(child, { jsonrpc: "2.0", method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {} }, id: 1 }), 100);
    const { stdout } = await collectStdio(child, 2000);
    const initResp = stdout.split("\n").filter(Boolean)
        .map(l => { try {
        return JSON.parse(l);
    }
    catch {
        return null;
    } })
        .find((r) => r && r.id === 1);
    assert.ok(initResp, `initialize response not received`);
    assert.ok(!initResp.error, `initialize returned error: ${JSON.stringify(initResp.error)}`);
    assert.strictEqual(initResp.result?.protocolVersion, "2024-11-05");
    assert.strictEqual(initResp.result?.serverInfo?.name, "project-brain");
    assert.ok(initResp.result?.capabilities?.tools !== undefined, "capabilities.tools missing");
}
async function testFullProtocolSequence() {
    const child = spawnBrain("/tmp");
    // Full protocol as OpenCode sends it
    setTimeout(() => sendLine(child, { jsonrpc: "2.0", method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: { roots: { listChanged: true } } }, id: 0 }), 100);
    setTimeout(() => sendLine(child, { jsonrpc: "2.0", method: "notifications/initialized", params: {} }), 300);
    setTimeout(() => sendLine(child, { jsonrpc: "2.0", method: "tools/list", params: { cursor: null }, id: 1 }), 400);
    setTimeout(() => sendLine(child, { jsonrpc: "2.0", method: "tools/call", params: {
            name: "brain.get_context",
            arguments: { query: "test", workspaceRoot: "/tmp", snapshotId: "test-snap", maxTokens: 100 }
        }, id: 2 }), 700);
    const { stdout } = await collectStdio(child, 5000);
    const lines = stdout.split("\n").filter(Boolean);
    const parsed = lines.map(l => { try {
        return JSON.parse(l);
    }
    catch {
        return null;
    } }).filter(Boolean);
    const initResp = parsed.find((r) => r.id === 0);
    const listResp = parsed.find((r) => r.id === 1);
    const callResp = parsed.find((r) => r.id === 2);
    assert.ok(initResp && !initResp.error, "initialize failed");
    assert.ok(listResp && !listResp.error && listResp.result?.tools, "tools/list failed");
    assert.ok(callResp && !callResp.error, `tools/call failed: ${JSON.stringify(callResp)}`);
    // No ANSI anywhere
    assert.ok(!/\x1b/.test(stdout), "ANSI found in full protocol sequence stdout");
}
// ─────────────────────────────────────────────────────────────────────────────
const TESTS = [
    ["Stdout purity — no ANSI, no OSC, all lines valid JSON", testStdoutPurity],
    ["tools/list — each tool has inputSchema with type:object", testInputSchemaInToolsList],
    ["tools/list — all 6 required brain tools exposed", testAllRequiredToolsExposed],
    ["initialize — correct protocolVersion and serverInfo", testInitializeResponse],
    ["Full protocol sequence — initialize → tools/list → tools/call — clean stdout", testFullProtocolSequence],
];
async function run() {
    let pass = 0;
    let fail = 0;
    console.log("BUILD-067D — MCP stdio Output Purity Regression Tests");
    console.log("─".repeat(60));
    for (const [name, fn] of TESTS) {
        try {
            await fn();
            console.log(`  ✓  ${name}`);
            pass++;
        }
        catch (err) {
            console.log(`  ✗  ${name}`);
            console.log(`     ${err.message}`);
            fail++;
        }
    }
    console.log("─".repeat(60));
    console.log(`Results: ${pass}/${pass + fail} passed`);
    if (fail > 0) {
        process.exit(1);
    }
}
run();
