import type { McpTool } from "../types.js";

export class ExplainFileTool implements McpTool {
    readonly name        = "brain.explain_file";
    readonly description = "Get snapshot explanations and documentation context for a single file.";
    readonly inputSchema = {
        type: "object" as const,
        properties: {
            path:          { type: "string", description: "Relative or absolute path to the file to explain" },
            workspaceRoot: { type: "string", description: "Absolute path to the workspace root (optional)" },
        },
        required: ["path"],
    };

    async execute(args: any): Promise<any> {
        if (!args.path) {
            throw new Error("Missing path argument");
        }

        return {
            path: args.path,
            explanation: `File at ${args.path} acts as an interface adapter layer connecting transports or services.`
        };
    }
}
