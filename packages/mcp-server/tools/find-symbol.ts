import type { McpTool } from "../types.js";

export class FindSymbolTool implements McpTool {
    readonly name        = "brain.find_symbol";
    readonly description = "Find symbol definitions in workspace snapshots without doing repository traversal.";
    readonly inputSchema = {
        type: "object" as const,
        properties: {
            name:          { type: "string", description: "Symbol name to look up (class, function, variable, type, interface)" },
            workspaceRoot: { type: "string", description: "Absolute path to the workspace root (optional)" },
        },
        required: ["name"],
    };

    async execute(args: any): Promise<any> {
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

export class FindDependenciesTool implements McpTool {
    readonly name        = "brain.find_dependencies";
    readonly description = "Find file or package import dependencies using the workspace dependency graph.";
    readonly inputSchema = {
        type: "object" as const,
        properties: {
            file:          { type: "string", description: "Relative or absolute path to the file whose imports should be resolved" },
            workspaceRoot: { type: "string", description: "Absolute path to the workspace root (optional)" },
        },
        required: ["file"],
    };

    async execute(args: any): Promise<any> {
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

export class SearchMemoryTool implements McpTool {
    readonly name        = "brain.search_memory";
    readonly description = "Query local semantic memory and recommendations for the current workspace.";
    readonly inputSchema = {
        type: "object" as const,
        properties: {
            query:         { type: "string", description: "Semantic query to search local workspace memories and recommendations" },
            workspaceRoot: { type: "string", description: "Absolute path to the workspace root (optional)" },
        },
        required: ["query"],
    };

    async execute(args: any): Promise<any> {
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
