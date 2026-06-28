export class ExplainFileTool {
    name = "brain.explain_file";
    description = "Get snapshot explanations and documentation context for a single file.";
    inputSchema = {
        type: "object",
        properties: {
            path: { type: "string", description: "Relative or absolute path to the file to explain" },
            workspaceRoot: { type: "string", description: "Absolute path to the workspace root (optional)" },
        },
        required: ["path"],
    };
    async execute(args) {
        if (!args.path) {
            throw new Error("Missing path argument");
        }
        return {
            path: args.path,
            explanation: `File at ${args.path} acts as an interface adapter layer connecting transports or services.`
        };
    }
}
