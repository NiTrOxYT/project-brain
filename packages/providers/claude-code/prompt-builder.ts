// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050B — Claude Code Provider — Prompt Builder
// ──────────────────────────────────────────────────────────────────────────────

import { RuntimeRequest } from "../../agent-runtime/types";

export function buildPrompt(request: RuntimeRequest): string {
    const { task, context } = request;

    const fileSection = task.file ? `- Target File: ${task.file}` : "";
    const symbolSection = task.symbol ? `- Target Symbol: ${task.symbol}` : "";

    const constraintsSection = context.constraints
        ? Object.entries(context.constraints)
            .map(([key, val]) => `- ${key}: ${val}`)
            .join("\n")
        : "";

    const rulesSection = context.rules
        ? Object.entries(context.rules)
            .map(([key, val]) => `- ${key}: ${val}`)
            .join("\n")
        : "";

    const workspaceContext = context.workspaceContext
        ? `- Workspace Context: ${typeof context.workspaceContext === "object" ? JSON.stringify(context.workspaceContext) : context.workspaceContext}`
        : "";

    return `Task Request:
Task ID: ${task.id}
Task Type: ${task.type}
Title: ${task.title}
${fileSection}
${symbolSection}
${workspaceContext}

Context:
${JSON.stringify(context, null, 2)}

Engineering Constraints:
${constraintsSection || "None specified."}

Workspace Rules:
${rulesSection || "None specified."}

CRITICAL EXECUTION RULES:
1. You MUST NEVER modify any files on the filesystem directly. Do NOT write, delete, or create files on disk.
2. You only propose changes by returning them in a structured machine-readable format.
3. You MUST format your proposed changes and artifacts in a single JSON block wrapped inside ---START_ARTIFACTS--- and ---END_ARTIFACTS---.
4. Any conversational output or explanation must come BEFORE or AFTER the artifacts block.
5. The JSON format must adhere strictly to the following schema:
{
  "artifacts": [
    {
      "id": "unique-id",
      "type": "code" | "patch" | "test" | "documentation" | "log" | "diagnostic",
      "path": "relative/file/path",
      "content": "raw content or patch/diff content"
    }
  ]
}
Each artifact must have a valid type. For patches/diffs, use type "patch". For new code/full files, use type "code".
`;
}
