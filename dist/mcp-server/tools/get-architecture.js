export class GetArchitectureTool {
    name = "brain.get_architecture";
    description = "Get workspace high-level architecture layouts and directories mapping.";
    inputSchema = {
        type: "object",
        properties: {
            workspaceRoot: { type: "string", description: "Absolute path to the workspace root (optional)" },
        },
        required: [],
    };
    async execute(args) {
        return {
            architectureSummary: "Project Brain is structured into independent packages: ai-gateway, provider-bridge, context-provider, and mcp-server."
        };
    }
}
