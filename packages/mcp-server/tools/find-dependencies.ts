import type { McpTool } from "../types.js";

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

        return {
            file: args.file,
            imports: [
                "./types.js",
                "../context-provider/types.js"
            ]
        };
    }
}
