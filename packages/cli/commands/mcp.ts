import fs from "fs";
import path from "path";
import { GlobalOptions } from "../main.js";
import { logger } from "../utils/logger.js";
import { brainDir } from "../utils/paths.js";
import { McpServer, HttpTransport, McpSessionManager, McpToolRegistry } from "../../mcp-server/index.js";

export interface McpOptions {
    port?: number;
}

function getMcpConfigPath(workspace: string): string {
    const dir = brainDir(workspace);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, "mcp-server.json");
}

export async function runMcpStart(opts: GlobalOptions, cmdOpts: McpOptions): Promise<void> {
    const port = cmdOpts.port ?? 8765;
    const configPath = getMcpConfigPath(opts.workspace);

    if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        // Check if process still alive
        try {
            process.kill(config.pid, 0);
            logger.log(`MCP server is already running on port ${config.port} (PID: ${config.pid})`);
            return;
        } catch {
            // Process is dead, clean up config
            fs.unlinkSync(configPath);
        }
    }

    const token = McpSessionManager.getGlobalToken();
    logger.log(`Starting Brain MCP Server on port ${port}...`);
    logger.log(`Session Token: \x1b[32m${token}\x1b[0m`);

    const transport = new HttpTransport(port);
    const server = new McpServer(transport);

    // Write config info so commands can check status/stop
    fs.writeFileSync(configPath, JSON.stringify({
        pid: process.pid,
        port,
        token,
        startedAt: Date.now()
    }, null, 2));

    // Start in background/async so the CLI command returns or runs
    // For test validation, we start server synchronously. If we are running in tests we let it keep listening.
    // In production CLI, daemonizing can be done or we run it as a service.
    await server.start();
    logger.log(`Brain MCP Server listening on 127.0.0.1:${port}`);
}

export async function runMcpStop(opts: GlobalOptions, cmdOpts: McpOptions): Promise<void> {
    const configPath = getMcpConfigPath(opts.workspace);
    if (!fs.existsSync(configPath)) {
        logger.log("Brain MCP Server is not running.");
        return;
    }

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    logger.log(`Stopping Brain MCP Server (PID: ${config.pid})...`);
    try {
        process.kill(config.pid, "SIGTERM");
    } catch {}

    try {
        fs.unlinkSync(configPath);
    } catch {}
    logger.log("Brain MCP Server stopped.");
}

export async function runMcpStatus(opts: GlobalOptions, cmdOpts: McpOptions): Promise<void> {
    const configPath = getMcpConfigPath(opts.workspace);
    if (!fs.existsSync(configPath)) {
        logger.log("Brain MCP Server status: \x1b[31mstopped\x1b[0m");
        return;
    }

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    try {
        process.kill(config.pid, 0);
        const uptimeSec = Math.floor((Date.now() - config.startedAt) / 1000);
        const tel = McpServer.getTelemetry();

        logger.log(`Brain MCP Server status: \x1b[32mrunning\x1b[0m`);
        logger.log(`  PID            : ${config.pid}`);
        logger.log(`  Port           : ${config.port}`);
        logger.log(`  Uptime         : ${uptimeSec}s`);
        logger.log(`  Active Sessions: ${McpSessionManager.listSessions().length}`);
        logger.log(`  Active Transport: http`);
        logger.log(`  Requests Served: ${tel.requestsServed}`);
        logger.log(`  Avg Latency    : ${tel.requestsServed > 0 ? (tel.totalLatencyMs / tel.requestsServed).toFixed(1) : 0}ms`);
        logger.log(`  Auth Failures  : ${tel.authenticationFailures}`);
        logger.log(`  Tool Failures  : ${tel.toolExecutionFailures}`);
    } catch {
        logger.log("Brain MCP Server status: \x1b[31mstopped\x1b[0m (stale lockfile found)");
        fs.unlinkSync(configPath);
    }
}

export async function runMcpTools(opts: GlobalOptions, cmdOpts: McpOptions): Promise<void> {
    logger.log("Registered Model Context Protocol (MCP) Tools:");
    const tools = McpToolRegistry.list();
    for (const tool of tools) {
        logger.log(`  - \x1b[1m${tool.name}\x1b[0m: ${tool.description}`);
    }
}

export async function runMcpStdio(opts: GlobalOptions): Promise<void> {
    // ── MCP stdio purity: stdout is exclusively for JSON-RPC ────────────────
    // Redirect ALL logger output to stderr immediately, before any further imports.
    const { setRedirectToStderr } = await import("../utils/logger.js");
    const { setLogLevel }         = await import("../utils/logger.js");
    const { setColorEnabled }     = await import("../utils/colors.js");
    setRedirectToStderr(true);
    setLogLevel("silent");      // suppress all logger.log/info/warn/debug output
    setColorEnabled(false);     // disable ANSI color codes in any string helpers

    // Intercept any stray console.log calls that might originate from third-party
    // modules or indirect requires — redirect them to stderr.
    const originalConsoleLog  = console.log.bind(console);
    const originalConsoleInfo = console.info.bind(console);
    console.log  = (...args: any[]) => console.error("[mcp-log]",  ...args);
    console.info = (...args: any[]) => console.error("[mcp-info]", ...args);

    const { StdioTransport } = await import("../../mcp-server/transports/stdio.js");
    const transport = new StdioTransport();
    const server = new McpServer(transport, { enforceAuth: false });

    await server.start();
    // Keep process alive until the client closes stdin
    await new Promise<void>((resolve) => {
        process.stdin.on("end", () => {
            server.stop().then(resolve);
        });
    });

    // Restore console methods after shutdown (for test runner cleanup)
    console.log  = originalConsoleLog;
    console.info = originalConsoleInfo;
}


export async function runMcpVerify(opts: GlobalOptions): Promise<void> {
    const { spawn } = await import("child_process");
    const { McpSessionManager } = await import("../../mcp-server/session.js");
    const token = McpSessionManager.getGlobalToken();

    logger.log("Launching Brain MCP stdio server validation process...");
    
    // We launch using same node + compiled cli path
    const cliPath = path.join(opts.workspace, "dist", "cli", "cli.js");
    if (!fs.existsSync(cliPath)) {
        throw new Error(`Compiled CLI wrapper does not exist at: ${cliPath}. Please build project first.`);
    }

    const child = spawn(process.argv[0], [cliPath, "mcp", "stdio"], {
        env: { ...process.env, BRAIN_WORKSPACE: opts.workspace }
    });

    let buffer = "";
    const pendingRequests = new Map<number, (res: any) => void>();

    child.stderr.on("data", (chunk) => {
        logger.debug(`[server-stderr] ${chunk.toString().trim()}`);
    });

    child.stdout.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const response = JSON.parse(line);
                const resolver = pendingRequests.get(response.id);
                if (resolver) {
                    pendingRequests.delete(response.id);
                    resolver(response);
                }
            } catch (err: any) {
                logger.error("Failed to parse stdout line JSON payload: " + line);
            }
        }
    });

    const sendRequest = (method: string, params?: any, id?: number): Promise<any> => {
        return new Promise((resolve, reject) => {
            const reqId = id !== undefined ? id : Math.floor(Math.random() * 100000);
            const payload = JSON.stringify({
                jsonrpc: "2.0",
                method,
                params,
                id: reqId
            }) + "\n";

            if (id !== undefined) {
                pendingRequests.set(reqId, resolve);
            }
            child.stdin.write(payload);
            if (id === undefined) {
                // Notifications do not have response, resolve immediately
                resolve(null);
            }
        });
    };

    try {
        // 1. Initialize
        logger.log("  [Step 1/6] Sending initialize...");
        const initRes = await sendRequest("initialize", { protocolVersion: "2024-11-05" }, 1);
        if (!initRes || initRes.error || !initRes.result) {
            throw new Error(`Initialize failed: ${JSON.stringify(initRes)}`);
        }
        logger.log("    ✓ protocolVersion: " + initRes.result.protocolVersion);

        // 2. Initialized
        logger.log("  [Step 2/6] Sending initialized notification...");
        await sendRequest("initialized");

        // 3. Tools/List
        logger.log("  [Step 3/6] Sending tools/list...");
        const listRes = await sendRequest("tools/list", {}, 2);
        if (!listRes || listRes.error || !listRes.result?.tools) {
            throw new Error(`tools/list failed: ${JSON.stringify(listRes)}`);
        }
        logger.log(`    ✓ Listed ${listRes.result.tools.length} tools`);

        // 4. Tools/Call (brain.get_context)
        logger.log("  [Step 4/6] Invoking brain.get_context...");
        const callRes = await sendRequest("tools/call", {
            name: "brain.get_context",
            token, // Pass the authenticated token
            arguments: {
                query: "verification check",
                workspaceRoot: opts.workspace,
                snapshotId: "verification-snap",
                maxTokens: 1000
            }
        }, 3);
        if (!callRes || callRes.error || !callRes.result) {
            throw new Error(`tools/call failed: ${JSON.stringify(callRes)}`);
        }
        logger.log(`    ✓ Confidence: ${callRes.result.confidence}`);

        // 5. Shutdown
        logger.log("  [Step 5/6] Sending shutdown...");
        const shutRes = await sendRequest("shutdown", {}, 4);
        if (!shutRes || shutRes.error || shutRes.result !== null) {
            throw new Error(`Shutdown failed: ${JSON.stringify(shutRes)}`);
        }

        // 6. Exit
        logger.log("  [Step 6/6] Sending exit notification...");
        await sendRequest("exit");

        // Wait for child to exit
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                child.kill("SIGKILL");
                reject(new Error("Timeout waiting for child to exit"));
            }, 3000);

            child.on("close", (code) => {
                clearTimeout(timer);
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Child exited with non-zero code ${code}`));
                }
            });
        });

        logger.log("\n\x1b[32m✓ Stdio server protocol verified successfully!\x1b[0m");

    } catch (err: any) {
        child.kill("SIGKILL");
        logger.error(`Verification aborted: ${err.message}`);
        throw err;
    }
}
