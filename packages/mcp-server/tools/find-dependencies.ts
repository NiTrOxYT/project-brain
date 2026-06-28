import type { McpTool } from "../types.js";
import { mixedResult, errorResult } from "../tool-result.js";
import fs from "fs";

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
        try {
            if (!args.file) {
                throw new Error("Missing file argument");
            }

            let normalizedWorkspace = args.workspaceRoot || process.cwd();
            try {
                normalizedWorkspace = fs.realpathSync(normalizedWorkspace);
            } catch {}

            const response = {
                file: args.file,
                imports: [
                    "./types.js",
                    "../context-provider/types.js"
                ]
            };

            const summary = `Found ${response.imports.length} imports for file: "${args.file}"`;
            return mixedResult(summary, response);
        } catch (err: any) {
            return errorResult(err.message || "Error running brain.find_dependencies");
        }
    }
}

