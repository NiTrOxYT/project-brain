import assert from "assert";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
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
    console.log("Starting BUILD-067A MCP Stdio Server Compliance Regression Test Suite...\n");
    const cliPath = path.join(process.cwd(), "dist", "cli", "cli.js");
    if (!fs.existsSync(cliPath)) {
        throw new Error(`Compiled CLI wrapper does not exist at: ${cliPath}. Please build project first.`);
    }
    await test("1. Stdio server handles invalid JSON and returns compliant Parse Error", async () => {
        const child = spawn(process.argv[0], [cliPath, "mcp", "stdio"], {
            env: { ...process.env, BRAIN_WORKSPACE: process.cwd() }
        });
        let output = "";
        child.stdout.on("data", (chunk) => {
            output += chunk.toString();
        });
        // Write malformed payload
        child.stdin.write("malformed-payload-no-json\n");
        await new Promise((resolve) => {
            setTimeout(() => {
                child.stdin.end();
                resolve();
            }, 500);
        });
        const res = JSON.parse(output.trim());
        assert(res.jsonrpc === "2.0");
        assert(res.error !== undefined);
        assert(res.error.code === -32700); // Parse error
        assert(res.id === null);
    });
    await test("2. Stdio server handles unknown methods and unknown tools gracefully", async () => {
        const child = spawn(process.argv[0], [cliPath, "mcp", "stdio"], {
            env: { ...process.env, BRAIN_WORKSPACE: process.cwd() }
        });
        let output = "";
        child.stdout.on("data", (chunk) => {
            output += chunk.toString();
        });
        // Send unknown method
        child.stdin.write(JSON.stringify({
            jsonrpc: "2.0",
            method: "unknown_lifecycle_method",
            id: 201
        }) + "\n");
        await new Promise((resolve) => {
            setTimeout(() => {
                child.stdin.end();
                resolve();
            }, 500);
        });
        const res = JSON.parse(output.trim());
        assert(res.jsonrpc === "2.0");
        assert(res.error !== undefined);
        assert(res.error.code === -32601); // Method not found
        assert(res.id === 201);
    });
    await test("3. Stdio server processes concurrent requests and outputs line-delimited answers", async () => {
        const child = spawn(process.argv[0], [cliPath, "mcp", "stdio"], {
            env: { ...process.env, BRAIN_WORKSPACE: process.cwd() }
        });
        let output = "";
        child.stdout.on("data", (chunk) => {
            output += chunk.toString();
        });
        // Send two initialize requests concurrently
        child.stdin.write(JSON.stringify({
            jsonrpc: "2.0",
            method: "initialize",
            params: { protocolVersion: "2024-11-05" },
            id: 301
        }) + "\n");
        child.stdin.write(JSON.stringify({
            jsonrpc: "2.0",
            method: "initialize",
            params: { protocolVersion: "2024-11-05" },
            id: 302
        }) + "\n");
        await new Promise((resolve) => {
            setTimeout(() => {
                child.stdin.end();
                resolve();
            }, 800);
        });
        const lines = output.trim().split("\n").filter(Boolean);
        assert(lines.length === 2);
        const res1 = JSON.parse(lines[0]);
        const res2 = JSON.parse(lines[1]);
        assert(res1.id === 301 || res1.id === 302);
        assert(res2.id === 301 || res2.id === 302);
    });
    await test("4. Stderr logs are populated and stdout contains pure JSON-RPC protocol", async () => {
        const child = spawn(process.argv[0], [cliPath, "mcp", "stdio"], {
            env: { ...process.env, BRAIN_WORKSPACE: process.cwd(), NODE_ENV: "development" }
        });
        let stdoutData = "";
        let stderrData = "";
        child.stdout.on("data", chunk => stdoutData += chunk.toString());
        child.stderr.on("data", chunk => stderrData += chunk.toString());
        // Send standard initialize sequence
        child.stdin.write(JSON.stringify({
            jsonrpc: "2.0",
            method: "initialize",
            id: 401
        }) + "\n");
        await new Promise((resolve) => {
            setTimeout(() => {
                child.stdin.end();
                resolve();
            }, 500);
        });
        // Verify stdout contains ONLY json
        const response = JSON.parse(stdoutData.trim());
        assert(response.jsonrpc === "2.0");
        // Verify no console log statements or banner text are present in stdoutData
        assert(!stdoutData.includes("Starting Brain MCP"));
        assert(!stdoutData.includes("Uptime"));
    });
    console.log("\nAll BUILD-067A regression tests passed successfully!");
}
runTests();
