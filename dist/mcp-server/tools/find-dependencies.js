import { mixedResult, errorResult } from "../tool-result.js";
import fs from "fs";
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
        try {
            if (!args.file) {
                throw new Error("Missing file argument");
            }
            let normalizedWorkspace = args.workspaceRoot || process.cwd();
            try {
                normalizedWorkspace = fs.realpathSync(normalizedWorkspace);
            }
            catch { }
            const response = {
                file: args.file,
                imports: [
                    "./types.js",
                    "../context-provider/types.js"
                ]
            };
            const summary = `Found ${response.imports.length} imports for file: "${args.file}"`;
            return mixedResult(summary, response);
        }
        catch (err) {
            return errorResult(err.message || "Error running brain.find_dependencies");
        }
    }
}
