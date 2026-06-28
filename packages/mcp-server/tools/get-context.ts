import type { McpTool } from "../types.js";
import { ContextProvider } from "../../context-provider/provider.js";
import { mixedResult, errorResult } from "../tool-result.js";
import fs from "fs";

export class GetContextTool implements McpTool {
    readonly name        = "brain.get_context";
    readonly description = "Get optimized workspace context matching a developer query, limiting prompt tokens.";
    readonly inputSchema = {
        type: "object" as const,
        properties: {
            query:               { type: "string",  description: "The developer query or task description to retrieve context for" },
            workspaceRoot:       { type: "string",  description: "Absolute path to the project workspace root directory" },
            snapshotId:          { type: "string",  description: "Brain snapshot ID to query (omit or use 'latest' for the most recent)" },
            maxTokens:           { type: "number",  description: "Maximum token budget for the returned context (default: 4000)" },
            providerId:          { type: "string",  description: "ID of the requesting provider (e.g. opencode, claude, codex)" },
            openFiles:           { type: "array",   description: "Currently open file paths in the editor", items: { type: "string" } },
            recentlyEditedFiles: { type: "array",   description: "Recently edited file paths", items: { type: "string" } },
            cursorFile:          { type: "string",  description: "File path where cursor is currently positioned" },
        },
        required: ["query", "workspaceRoot"],
    };

    async execute(args: any): Promise<any> {
        try {
            if (!args.query || !args.workspaceRoot) {
                throw new Error("Missing query or workspaceRoot argument");
            }

            let normalizedWorkspace = args.workspaceRoot;
            try {
                normalizedWorkspace = fs.realpathSync(args.workspaceRoot);
            } catch {}

            // Default snapshotId to "latest" when omitted
            const snapshotId = args.snapshotId && args.snapshotId !== "" ? args.snapshotId : "latest";

            // Trace log to stderr (visible in MCP server logs)
            process.stderr.write(
                `[brain.get_context] workspace=${normalizedWorkspace} snapshotId=${snapshotId} query="${args.query}"\n`
            );

            const provider = new ContextProvider(normalizedWorkspace, normalizedWorkspace);
            const response = await provider.getContext({
                providerId:          args.providerId || "opencode",
                query:               args.query,
                workspaceRoot:       normalizedWorkspace,
                snapshotId,
                maxTokens:           args.maxTokens || 4000,
                openFiles:           args.openFiles || [],
                recentlyEditedFiles: args.recentlyEditedFiles || [],
                cursorFile:          args.cursorFile,
                cursorRange:         args.cursorRange
            });

            process.stderr.write(
                `[brain.get_context] result: confidence=${response.confidence} tokens=${response.estimatedTokens} ` +
                `rankedFiles=${response.rankedFiles.length} snippets=${response.snippets.length} ` +
                `memory=${response.semanticMemory.length} deps=${response.dependencySummary.length}\n`
            );

            const summary = response.architectureSummary || "No architecture summary compiled.";
            return mixedResult(summary, response);
        } catch (err: any) {
            return errorResult(err.message || "Error running brain.get_context");
        }
    }
}

