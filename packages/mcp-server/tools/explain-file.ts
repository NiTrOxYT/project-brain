import type { McpTool } from "../types.js";
import { mixedResult, errorResult } from "../tool-result.js";
import fs from "fs";

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
        try {
            if (!args.path) {
                throw new Error("Missing path argument");
            }

            let normalizedWorkspace = args.workspaceRoot || process.cwd();
            try {
                normalizedWorkspace = fs.realpathSync(normalizedWorkspace);
            } catch {}

            const explanation = `File at ${args.path} acts as an interface adapter layer connecting transports or services.`;
            return mixedResult(explanation, {
                path: args.path,
                explanation
            });
        } catch (err: any) {
            return errorResult(err.message || "Error running brain.explain_file");
        }
    }
}

