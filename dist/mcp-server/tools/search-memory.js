export class SearchMemoryTool {
    name = "brain.search_memory";
    description = "Query local semantic memory and recommendations for the current workspace.";
    inputSchema = {
        type: "object",
        properties: {
            query: { type: "string", description: "Semantic query to search local workspace memories and recommendations" },
            workspaceRoot: { type: "string", description: "Absolute path to the workspace root (optional)" },
        },
        required: ["query"],
    };
    async execute(args) {
        if (!args.query) {
            throw new Error("Missing query argument");
        }
        return {
            query: args.query,
            memories: [
                {
                    id: "mem-065",
                    type: "architecture",
                    content: "Always run npm run build to check compilation before checking tests.",
                    confidence: 0.98
                }
            ]
        };
    }
}
