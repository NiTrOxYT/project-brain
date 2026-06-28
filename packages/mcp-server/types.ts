// MCP JSON Schema type (subset sufficient for tool definitions)
export interface McpJsonSchema {
    type: "object";
    properties: Record<string, {
        type: string;
        description?: string;
        items?: { type: string };
        default?: unknown;
    }>;
    required?: string[];
}

export interface McpTool {
    readonly name:        string;
    readonly description: string;
    readonly inputSchema: McpJsonSchema;
    execute(args: any): Promise<any>;
}

export interface McpTransport {
    start(handler: (request: any) => Promise<any>): Promise<void>;
    stop(): Promise<void>;
}

export interface McpServerOptions {
    transport: "stdio" | "http";
    port?: number;
}
