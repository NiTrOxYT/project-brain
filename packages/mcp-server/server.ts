import { McpToolRegistry } from "./registry.js";
import { McpSessionManager } from "./session.js";
import type { McpTransport } from "./types.js";

export interface McpServerTelemetry {
    uptimeStart:            number;
    requestsServed:         number;
    averageRequestLatency:  number;
    authenticationFailures: number;
    toolExecutionFailures:  number;
    totalLatencyMs:         number;
}

export interface McpServerConfig {
    enforceAuth?: boolean;
}

export class McpServer {
    private readonly transport: McpTransport;
    private readonly options:   McpServerConfig;
    private static telemetry: McpServerTelemetry = {
        uptimeStart:            Date.now(),
        requestsServed:         0,
        averageRequestLatency:  0,
        authenticationFailures: 0,
        toolExecutionFailures:  0,
        totalLatencyMs:         0
    };

    constructor(transport: McpTransport, options?: McpServerConfig) {
        this.transport = transport;
        this.options = options || { enforceAuth: true };
    }

    async start(): Promise<void> {
        McpServer.telemetry.uptimeStart = Date.now();
        await this.transport.start(async (req) => this.handleRequest(req));
    }

    async stop(): Promise<void> {
        await this.transport.stop();
    }

    static getTelemetry(): McpServerTelemetry {
        return this.telemetry;
    }

    static clearTelemetry(): void {
        this.telemetry = {
            uptimeStart:            Date.now(),
            requestsServed:         0,
            averageRequestLatency:  0,
            authenticationFailures: 0,
            toolExecutionFailures:  0,
            totalLatencyMs:         0
        };
    }

    private async handleRequest(rawRequest: any): Promise<any> {
        const start = Date.now();
        McpServer.telemetry.requestsServed++;

        try {
            // Parse JSON-RPC wrapper
            if (!rawRequest || typeof rawRequest !== "object") {
                throw new Error("Invalid JSON-RPC request layout");
            }

            const { method, params, id } = rawRequest;

            // Handle standard lifecycle methods
            if (method === "initialize") {
                return {
                    jsonrpc: "2.0",
                    result: {
                        protocolVersion: "2024-11-05",
                        capabilities: {
                            tools: {}
                        },
                        serverInfo: {
                            name: "project-brain",
                            version: "0.1.0"
                        }
                    },
                    id
                };
            }

            if (method === "notifications/initialized" || method === "initialized") {
                return null; // Notifications do not send JSON-RPC responses
            }

            if (method === "shutdown") {
                return { jsonrpc: "2.0", result: null, id };
            }

            if (method === "exit") {
                setTimeout(() => process.exit(0), 10);
                return null;
            }

            // Handle metadata list tools endpoint
            if (method === "tools/list") {
                const list = McpToolRegistry.list().map(t => ({
                    name:        t.name,
                    description: t.description,
                    // inputSchema is REQUIRED by MCP spec and validated by all clients
                    inputSchema: t.inputSchema ?? { type: "object", properties: {} }
                }));
                return { jsonrpc: "2.0", result: { tools: list }, id };
            }

            if (method === "tools/call") {
                const toolName = params?.name;
                const toolArgs = params?.arguments || {};
                const token = params?.token || toolArgs?.token;

                // 1. Authenticate
                const enforce = this.options.enforceAuth !== false;
                if (enforce && (!token || !McpSessionManager.validateToken(token))) {
                    McpServer.telemetry.authenticationFailures++;
                    return {
                        jsonrpc: "2.0",
                        error: { code: -32001, message: "Authentication failed. Missing or invalid token." },
                        id
                    };
                }

                // 2. Locate Tool
                const tool = McpToolRegistry.get(toolName);
                if (!tool) {
                    McpServer.telemetry.toolExecutionFailures++;
                    return {
                        jsonrpc: "2.0",
                        error: { code: -32601, message: `Tool "${toolName}" not found` },
                        id
                    };
                }

                // 3. Execute Tool
                try {
                    const result = await tool.execute(toolArgs);
                    
                    const latency = Date.now() - start;
                    McpServer.telemetry.totalLatencyMs += latency;
                    McpServer.telemetry.averageRequestLatency = 
                        McpServer.telemetry.totalLatencyMs / McpServer.telemetry.requestsServed;

                    return { jsonrpc: "2.0", result, id };
                } catch (err: any) {
                    McpServer.telemetry.toolExecutionFailures++;
                    return {
                        jsonrpc: "2.0",
                        error: { code: -32603, message: err.message || "Internal error during tool execution" },
                        id
                    };
                }
            }

            return {
                jsonrpc: "2.0",
                error: { code: -32601, message: `Method "${method}" not supported` },
                id
            };

        } catch (err: any) {
            return {
                jsonrpc: "2.0",
                error: { code: -32700, message: err.message || "Parse error" },
                id: null
            };
        }
    }
}
