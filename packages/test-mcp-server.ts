import assert from "assert";
import http from "http";
import { McpServer, McpSessionManager, McpToolRegistry, HttpTransport, StdioTransport } from "./mcp-server/index.js";

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
    console.log("Starting BUILD-065 Model Context Protocol (MCP) Server Test Suite...\n");

    await test("1. Statically registered default tools exist in tool registry", () => {
        const tools = McpToolRegistry.list();
        assert(tools.length >= 6, "Expected at least 6 default tools registered");
        assert(McpToolRegistry.get("brain.get_context") !== undefined);
        assert(McpToolRegistry.get("brain.find_symbol") !== undefined);
        assert(McpToolRegistry.get("brain.find_dependencies") !== undefined);
        assert(McpToolRegistry.get("brain.search_memory") !== undefined);
        assert(McpToolRegistry.get("brain.get_architecture") !== undefined);
        assert(McpToolRegistry.get("brain.explain_file") !== undefined);
    });

    await test("2. McpSessionManager generates tokens, tracks transport, and validates logins", () => {
        McpSessionManager.clear();
        
        const session = McpSessionManager.generateSession("http");
        assert(session.transport === "http");
        assert(session.token.length > 10);
        assert(McpSessionManager.validateToken(session.token) === true);
        assert(McpSessionManager.validateToken("wrong-token") === false);
    });

    await test("3. JSON-RPC tools/list returns registered tools", async () => {
        McpSessionManager.clear();
        McpServer.clearTelemetry();

        const transport = new StdioTransport();
        const server = new McpServer(transport);

        let response: any;
        await transport.start(async (req) => {
            response = req;
            return null;
        });

        // Trigger request locally simulating client call
        const res = await (server as any).handleRequest({
            jsonrpc: "2.0",
            method: "tools/list",
            id: 1
        });

        assert(res.jsonrpc === "2.0");
        assert(res.result.tools.length >= 6);
        assert(res.id === 1);

        await server.stop();
    });

    await test("4. JSON-RPC tools/call blocks unauthenticated requests", async () => {
        McpSessionManager.clear();
        McpServer.clearTelemetry();

        const transport = new StdioTransport();
        const server = new McpServer(transport);

        const res = await (server as any).handleRequest({
            jsonrpc: "2.0",
            method: "tools/call",
            params: {
                name: "brain.get_context",
                arguments: {},
                token: "invalid-token"
            },
            id: 2
        });

        assert(res.jsonrpc === "2.0");
        assert(res.error !== undefined, "Expected error due to invalid token");
        assert(res.error.code === -32001);

        const tel = McpServer.getTelemetry();
        assert(tel.authenticationFailures === 1);
    });

    await test("5. HTTP loopback transport serves POST endpoint and handles execution payload", async () => {
        McpSessionManager.clear();
        McpServer.clearTelemetry();

        const token = McpSessionManager.getGlobalToken();
        const transport = new HttpTransport(8999);
        const server = new McpServer(transport);

        await server.start();

        // Query server over loopback HTTP POST
        const reqData = JSON.stringify({
            jsonrpc: "2.0",
            method: "tools/call",
            params: {
                name: "brain.get_context",
                token,
                arguments: {
                    query: "test config patterns",
                    workspaceRoot: "packages/context-retrieval",
                    snapshotId: "snap-a1b2c3d4",
                    maxTokens: 1000
                }
            },
            id: 10
        });

        const resPromise = new Promise<any>((resolve, reject) => {
            const req = http.request({
                hostname: "127.0.0.1",
                port: 8999,
                path: "/",
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(reqData)
                }
            }, (res) => {
                let data = "";
                res.on("data", chunk => data += chunk.toString());
                res.on("end", () => resolve(JSON.parse(data)));
            });
            req.on("error", reject);
            req.write(reqData);
            req.end();
        });

        const res = await resPromise;
        assert(res.jsonrpc === "2.0");
        assert(res.error === undefined);
        assert(res.result.confidence > 0.5);

        const tel = McpServer.getTelemetry();
        assert(tel.requestsServed === 1);
        assert(tel.authenticationFailures === 0);

        await server.stop();
    });

    await test("6. MCP lifecycle methods (initialize, shutdown, initialized) return compliant payloads", async () => {
        const transport = new StdioTransport();
        const server = new McpServer(transport);

        // Initialize method check
        const initRes = await (server as any).handleRequest({
            jsonrpc: "2.0",
            method: "initialize",
            params: { protocolVersion: "2024-11-05" },
            id: 101
        });
        assert(initRes.jsonrpc === "2.0");
        assert(initRes.result.protocolVersion === "2024-11-05");
        assert(initRes.result.serverInfo.name === "project-brain");

        // Initialized notification check (should return null)
        const initializedRes = await (server as any).handleRequest({
            jsonrpc: "2.0",
            method: "initialized"
        });
        assert(initializedRes === null);

        // Shutdown method check
        const shutdownRes = await (server as any).handleRequest({
            jsonrpc: "2.0",
            method: "shutdown",
            id: 102
        });
        assert(shutdownRes.jsonrpc === "2.0");
        assert(shutdownRes.result === null);
    });

    console.log("\nAll BUILD-065 tests passed successfully!");
}

runTests();
