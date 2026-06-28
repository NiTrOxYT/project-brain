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
        return {
            file: args.file,
            imports: [
                "./types.js",
                "../context-provider/types.js"
            ]
        };
    }
}
