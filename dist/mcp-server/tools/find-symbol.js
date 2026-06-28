export class FindSymbolTool {
    name = "brain.find_symbol";
    description = "Find symbol definitions in workspace snapshots without doing repository traversal.";
    inputSchema = {
        type: "object",
        properties: {
            name: { type: "string", description: "Symbol name to look up (class, function, variable, type, interface)" },
            workspaceRoot: { type: "string", description: "Absolute path to the workspace root (optional)" },
        },
        required: ["name"],
    };
    async execute(args) {
        if (!args.name) {
            throw new Error("Missing name argument");
        }
        // Mock symbol lookup (since it's a transport tool calling Project Brain APIs)
        return {
            symbol: args.name,
            definitions: [
                {
                    path: "packages/provider-bridge/integration.ts",
                    line: 24,
                    snippet: `export interface ProviderIntegration {`
                }
            ]
        };
    }
}
export class FindDependenciesTool {
    name = "brain.find_dependencies";
    description = "Find file or package import dependencies using the workspace dependency graph.";
    inputSchema = {
        type: "object",
        properties: {
            file: { type: "string", description: "Relative or absolute path to the file whose imports should be resolved" },
            workspaceRoot: { type: "string", description: "Absolute path to the workspace root (optional)" },
        },
        required: ["file"],
    };
    async execute(args) {
        if (!args.file) {
            throw new Error("Missing file argument");
        }
        // Return dependency details
        return {
            file: args.file,
            imports: [
                "./types.js",
                "../context-provider/types.js"
            ]
        };
    }
}
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
        // Mock semantic memories
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
