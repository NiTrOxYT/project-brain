import { ContextProvider } from "../../context-provider/provider.js";
export class GetContextTool {
    name = "brain.get_context";
    description = "Get optimized workspace context matching a developer query, limiting prompt tokens.";
    inputSchema = {
        type: "object",
        properties: {
            query: { type: "string", description: "The developer query or task description to retrieve context for" },
            workspaceRoot: { type: "string", description: "Absolute path to the project workspace root directory" },
            snapshotId: { type: "string", description: "Brain snapshot ID to query (use latest if unknown)" },
            maxTokens: { type: "number", description: "Maximum token budget for the returned context (default: 4000)" },
            providerId: { type: "string", description: "ID of the requesting provider (e.g. opencode, claude, codex)" },
            openFiles: { type: "array", description: "Currently open file paths in the editor", items: { type: "string" } },
            recentlyEditedFiles: { type: "array", description: "Recently edited file paths", items: { type: "string" } },
            cursorFile: { type: "string", description: "File path where cursor is currently positioned" },
        },
        required: ["query", "workspaceRoot", "snapshotId"],
    };
    async execute(args) {
        if (!args.query || !args.workspaceRoot || !args.snapshotId) {
            throw new Error("Missing query, workspaceRoot, or snapshotId argument");
        }
        const provider = new ContextProvider(args.workspaceRoot, args.workspaceRoot);
        const response = await provider.getContext({
            providerId: args.providerId || "opencode",
            query: args.query,
            workspaceRoot: args.workspaceRoot,
            snapshotId: args.snapshotId,
            maxTokens: args.maxTokens || 4000,
            openFiles: args.openFiles || [],
            recentlyEditedFiles: args.recentlyEditedFiles || [],
            cursorFile: args.cursorFile,
            cursorRange: args.cursorRange
        });
        return response;
    }
}
