import type { McpTool } from "../types.js";

export class GetArchitectureTool implements McpTool {
    readonly name        = "brain.get_architecture";
    readonly description = "Get workspace high-level architecture layouts and directories mapping.";
    readonly inputSchema = {
        type: "object" as const,
        properties: {
            workspaceRoot: { type: "string", description: "Absolute path to the workspace root (optional)" },
        },
        required: [],
    };

    async execute(args: any): Promise<any> {
        return {
            architectureSummary: "Project Brain is structured into independent packages: ai-gateway, provider-bridge, context-provider, and mcp-server."
        };
    }
}
