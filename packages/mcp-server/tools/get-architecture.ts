import type { McpTool } from "../types.js";
import { ContextProvider } from "../../context-provider/provider.js";
import { mixedResult, errorResult } from "../tool-result.js";
import fs from "fs";

export class GetArchitectureTool implements McpTool {
    readonly name        = "brain.get_architecture";
    readonly description = "Get workspace high-level architecture layouts and directories mapping.";
    readonly inputSchema = {
        type: "object" as const,
        properties: {
            workspaceRoot: { type: "string", description: "Absolute path to the workspace root (optional)" },
        },
        required: [],
    };

    async execute(args: any): Promise<any> {
        try {
            const workspaceRoot = args.workspaceRoot || process.cwd();
            let normalizedWorkspace = workspaceRoot;
            try {
                normalizedWorkspace = fs.realpathSync(workspaceRoot);
            } catch {}

            const provider = new ContextProvider(normalizedWorkspace, normalizedWorkspace);
            const snapshot = await provider.getLatestSnapshot();

            if (!snapshot) {
                const noSnapSummary = "No snapshot compiled. Run: brain compile";
                return mixedResult(noSnapSummary, {
                    architectureSummary: noSnapSummary,
                    entries: []
                });
            }

            // Build summary from architecture entries
            if (snapshot.architecture && snapshot.architecture.length > 0) {
                const summary = snapshot.architecture
                    .slice(0, 30)
                    .map(e => `[${e.category}] ${e.title}: ${e.description}`)
                    .join("\n");
                return mixedResult(summary, {
                    architectureSummary: summary,
                    entries: snapshot.architecture
                });
            }

            // Fallback: generate summary from file counts in snapshot
            const fileCount  = snapshot.files?.length ?? 0;
            const symCount   = snapshot.symbols?.length ?? 0;
            const depCount   = snapshot.dependencies?.length ?? 0;
            const fallback   = `Workspace contains ${fileCount} files, ${symCount} symbols, and ${depCount} dependency edges. ` +
                `Run brain compile --force to refresh the architecture index.`;
            return mixedResult(fallback, {
                architectureSummary: fallback,
                entries: []
            });
        } catch (err: any) {
            return errorResult(err.message || "Error running brain.get_architecture");
        }
    }
}

