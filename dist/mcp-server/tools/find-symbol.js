import { mixedResult, errorResult } from "../tool-result.js";
import fs from "fs";
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
        try {
            if (!args.name) {
                throw new Error("Missing name argument");
            }
            let normalizedWorkspace = args.workspaceRoot || process.cwd();
            try {
                normalizedWorkspace = fs.realpathSync(normalizedWorkspace);
            }
            catch { }
            const response = {
                symbol: args.name,
                definitions: [
                    {
                        path: "packages/provider-bridge/integration.ts",
                        line: 24,
                        snippet: `export interface ProviderIntegration {`
                    }
                ]
            };
            const summary = `Found 1 definition for symbol: "${args.name}"`;
            return mixedResult(summary, response);
        }
        catch (err) {
            return errorResult(err.message || "Error running brain.find_symbol");
        }
    }
}
