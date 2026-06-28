import crypto from "crypto";
import path from "path";
import { FileSystemService } from "../filesystem/index.js";

interface ToolDoc {
    purpose: string;
    inputSummary: string;
    outputSummary: string;
    useWhen: string[];
    avoid?: string[];
    example: string;
}

const TOOL_DOCS: Record<string, ToolDoc> = {
    "brain.get_context": {
        purpose: "General semantic retrieval and workspace context extraction.",
        inputSummary: "query (string), workspaceRoot (string), snapshotId (string, optional), maxTokens (number, optional)",
        outputSummary: "CallToolResult containing natural language summary and structured ContextResponse (confidence, tokens, ranked files, semantic memory, dependency summary).",
        useWhen: [
            "asking questions about high-level architecture",
            "general project understanding",
            "conceptual questions"
        ],
        avoid: [
            "dependency questions",
            "file explanation",
            "symbol lookup"
        ],
        example: "get_context: \"How does authentication work?\""
    },
    "brain.explain_file": {
        purpose: "Explain a file's role and structure without reading its implementation first.",
        inputSummary: "path (string), workspaceRoot (string, optional)",
        outputSummary: "CallToolResult containing explanation text and file details.",
        useWhen: [
            "understanding a specific file's role or documentation context before inspection"
        ],
        avoid: [
            "dependency lookup",
            "symbol definition search"
        ],
        example: "explain_file: \"packages/runtime/service.ts\""
    },
    "brain.find_symbol": {
        purpose: "Find where a symbol is defined and referenced in workspace snapshots.",
        inputSummary: "symbolName (string), workspaceRoot (string, optional)",
        outputSummary: "CallToolResult containing symbol references, files, and line definitions.",
        useWhen: [
            "locating symbol definitions and usage patterns without traversing code"
        ],
        example: "find_symbol: \"RuntimeService\""
    },
    "brain.find_dependencies": {
        purpose: "Query the workspace dependency graph to trace file imports.",
        inputSummary: "path (string), workspaceRoot (string, optional)",
        outputSummary: "CallToolResult containing import and export dependency arrays.",
        useWhen: [
            "dependency graph lookup",
            "tracing what depends on a file or what a file imports"
        ],
        example: "find_dependencies: \"packages/workspace/service.ts\""
    },
    "brain.get_architecture": {
        purpose: "Get workspace high-level architecture layouts and directories mapping.",
        inputSummary: "workspaceRoot (string, optional)",
        outputSummary: "CallToolResult containing project architecture summary and directories list.",
        useWhen: [
            "explaining the compiler or main folder architecture"
        ],
        example: "get_architecture: \"\""
    },
    "brain.search_memory": {
        purpose: "Query local semantic memory and recommendations.",
        inputSummary: "query (string), workspaceRoot (string, optional)",
        outputSummary: "CallToolResult containing matching memory records.",
        useWhen: [
            "searching semantic workspace memories"
        ],
        example: "search_memory: \"authentication\""
    }
};

export class WorkspaceSkillGenerator {
    constructor(
        private readonly fs: FileSystemService,
        private readonly brainDir: string
    ) {}

    private get skillFilePath(): string {
        return path.join(this.brainDir, "SKILL.md");
    }

    private generateHeaderSection(hash: string): string {
        return `---
name: project-brain
description: "Authoritative semantic knowledge index and code analysis rules for Project Brain."
generatedBy: "project-brain"
hash: "${hash}"
---
`;
    }

    private generateOverviewSection(): string {
        return `## Project Brain Overview

Project Brain is the authoritative persistent runtime semantic knowledge engine for this software repository. It parses and analyzes the codebase structure, syntax trees, import graphs, and developer workflows. By indexing this intelligence, Project Brain enables AI development agents to solve complex coding tasks rapidly, accurately, and with minimal token usage.
`;
    }

    private generateOperatingProcedureSection(tools: any[]): string {
        const getToolLink = (base: string) => {
            const found = tools.find(t => t.name === `brain.${base}`);
            return found ? `\`${found.name}\`` : "N/A";
        };

        return `## AI Operating Procedure (Highest Priority)

This section has higher priority than all other instructions in the document.

For every repository-related request, AI agents must follow this workflow.

### Step 1 — Determine Whether Brain Is Needed
Determine whether the user’s request requires knowledge of this repository.
* If **NO**: Answer normally.
* If **YES**: Continue.

### Step 2 — Never Explore the Repository First
Before reading any source file, always use Project Brain. Do NOT begin by:
* browsing folders
* listing directories
* grepping the repository
* reading implementation files
* inspecting \`.brain\`
* reading MCP schema files
* reading provider configuration
* running Brain CLI commands

Project Brain is the semantic source of truth.

### Step 3 — Select Exactly One Brain MCP Tool
Choose the single best tool:

| User Request | Preferred Tool |
| :--- | :--- |
| Explain project | ${getToolLink("get_architecture")} |
| Explain file | ${getToolLink("explain_file")} |
| General architecture | ${getToolLink("get_context")} |
| Symbol usage | ${getToolLink("find_symbol")} |
| Dependencies | ${getToolLink("find_dependencies")} |
| Search semantic memory | ${getToolLink("search_memory")} |

Do not call multiple overlapping tools.

### Step 4 — Trust Brain
If Brain fully answers the question:
* Stop.
* Do not inspect implementation.
* Do not browse the repository.
* Answer directly.

### Step 5 — Read Code Only When Necessary
Only inspect implementation if:
* the user requests implementation details
* code changes are required
* Brain identifies specific files

Read only those files. Never explore unrelated code.

### Step 6 — Editing Workflow
1. Retrieve context using Brain.
2. Identify affected files.
3. Read only those files.
4. Make changes.
5. Answer the user.

Do not inspect unrelated modules.

### Brain Tool Priority
Prefer:
1. ${getToolLink("get_architecture")}
2. ${getToolLink("get_context")}
3. ${getToolLink("explain_file")}
4. ${getToolLink("find_symbol")}
5. ${getToolLink("find_dependencies")}
6. ${getToolLink("search_memory")}

### Forbidden Actions
Unless explicitly requested by the user:
* Never browse the repository to understand architecture.
* Never read random implementation files.
* Never inspect \`.brain\` internals.
* Never inspect MCP schema JSON files.
* Never inspect provider configuration.
* Never run Brain CLI commands for repository understanding.
* Never guess architecture from filenames.
* Never use filesystem exploration as the first step.
`;
    }

    private generateRulesSection(): string {
        return `## Core Operating Rules

1. **Brain MCP First**: Treat Project Brain as the absolute source of truth. Always query the Brain MCP tools before exploring files or reading code.
2. **Do Not Inspect Internals**: Never read or search directories inside \`.brain/\` (e.g. index, graph, symbols, snapshots, etc.) or metadata files directly.
3. **No Schema Reads**: Never open or inspect MCP schema JSON files.
4. **No CLI for Understanding**: Never execute \`brain\` CLI commands (like \`brain compile\`, \`brain query\`, etc.) to understand the project structure. The CLI is for human use only.
5. **No Provider Config Reads**: Never read provider configuration or metadata files.
`;
    }

    private generateRepositoryPolicySection(): string {
        return `## Repository Exploration Policy

* **No Blind Traversal**: Do not list directories, search files, or grep the repository to find architecture layouts or locate code symbols first.
* **Retrieved Context Only**: Only read or edit implementation files *after* Project Brain returns semantic context indicating they are relevant and necessary for the task.
* **Avoid Recursive Exploration**: Never recursively browse the repository trying to reconstruct understanding that Brain already possesses.
`;
    }

    private async generateMCPToolsSection(tools: any[]): Promise<string> {
        let md = `## Brain MCP Tool Reference\n\n`;
        md += `Project Brain registers the following tools dynamically. Prefer the most specific tool for each action:\n\n`;

        for (const tool of tools) {
            const meta = TOOL_DOCS[tool.name] || {
                purpose: tool.description,
                inputSummary: Object.keys(tool.inputSchema?.properties || {}).join(", ") || "None",
                outputSummary: "CallToolResult content block.",
                useWhen: ["calling " + tool.name + " to perform actions"],
                example: `${tool.name.split(".").pop()}: ""`
            };

            md += `### \`${tool.name}\`\n\n`;
            md += `* **Description**: ${tool.description}\n`;
            md += `* **Purpose**: ${meta.purpose}\n`;
            md += `* **Input Summary**: ${meta.inputSummary}\n`;
            md += `* **Output Summary**: ${meta.outputSummary}\n`;
            md += `* **When to Use**:\n`;
            for (const item of meta.useWhen) {
                md += `  * ${item}\n`;
            }
            if (meta.avoid && meta.avoid.length > 0) {
                md += `* **When NOT to Use**:\n`;
                for (const item of meta.avoid) {
                    md += `  * ${item}\n`;
                }
            }
            md += `* **Example**: \`${meta.example}\`\n\n`;
        }
        return md;
    }

    private generateDecisionTreeSection(tools: any[]): string {
        const getToolLink = (base: string) => {
            const found = tools.find(t => t.name === `brain.${base}`);
            return found ? `\`${found.name}\`` : "N/A";
        };

        return `## AI Decision Tree

Use this table to map user query types directly to the preferred Brain tool:

| User Request | Preferred Tool |
| :--- | :--- |
| Explain project / High-level overview | ${getToolLink("get_architecture")} |
| Explain a specific file | ${getToolLink("explain_file")} |
| Symbol definition / usage / lookup | ${getToolLink("find_symbol")} |
| Tracing dependencies / imports | ${getToolLink("find_dependencies")} |
| General semantic / architecture question | ${getToolLink("get_context")} |
| Search semantic memory | ${getToolLink("search_memory")} |
`;
    }

    private generateWorkflowExamplesSection(tools: any[]): string {
        const getToolLink = (base: string) => {
            const found = tools.find(t => t.name === `brain.${base}`);
            return found ? `\`${found.name}\`` : "N/A";
        };

        return `## Workflow Examples

### Example 1: High-Level Overview
* **User**: "Explain the compiler"
* **Expected Workflow**:
  1. Call ${getToolLink("get_architecture")} to retrieve architecture layouts.
  2. Answer the user directly from the returned context.
  * *Never* recursively browse folders, inspect files, or run grep first.

### Example 2: Symbol Reference
* **User**: "Where is RuntimeService used?"
* **Expected Workflow**:
  1. Call ${getToolLink("find_symbol")} specifying \`RuntimeService\`.
  2. Answer using the reference locations returned.

### Example 3: Dependency Trace
* **User**: "What depends on WorkspaceService?"
* **Expected Workflow**:
  1. Call ${getToolLink("find_dependencies")} specifying the path to \`WorkspaceService\`.

### Example 4: Implementation Task
* **User**: "Implement JWT authentication"
* **Expected Workflow**:
  1. Call ${getToolLink("get_context")} to retrieve authentication structures.
  2. Call ${getToolLink("explain_file")} on relevant implementation files first.
  3. Edit only the necessary code files.
`;
    }

    private generateEfficiencySection(tools: any[]): string {
        const getToolLink = (base: string) => {
            const found = tools.find(t => t.name === `brain.${base}`);
            return found ? `\`${found.name}\`` : "N/A";
        };

        return `## Tool Selection & Agent Efficiency Rules

### Preferred Tool Calling Order
1. ${getToolLink("get_architecture")}
2. ${getToolLink("get_context")}
3. ${getToolLink("explain_file")}
4. ${getToolLink("find_symbol")}
5. ${getToolLink("find_dependencies")}
6. ${getToolLink("search_memory")}

### Efficiency Guidelines
* **Minimize MCP Tool Calls**: Avoid redundant queries. Plan ahead and combine information requests.
* **Choose the Most Specific Tool**: Do not use generic tools (e.g. ${getToolLink("get_context")}) when specific tools (e.g. ${getToolLink("find_symbol")} or ${getToolLink("find_dependencies")}) exist.
* **Zero Codebase Grep for Understanding**: Never run grep or search tools for project understanding. Grep is solely for locating code modifications when editing.
* **Answer Directly**: If Brain returns sufficient context to answer a question, answer immediately without reading the source files.
`;
    }

    private generateFAQSection(): string {
        return `## Frequently Asked Questions

**Q: Should I inspect .brain/index?**
**A:** No. All index files are internal implementation details. Use MCP tools.

**Q: Should I run brain compile?**
**A:** No. The CLI commands are for humans. AI agents must use the MCP server.

**Q: Should I grep the repository first?**
**A:** No. Always use Project Brain first. Only use grep if you are about to modify code and need to locate exact lines.
`;
    }

    private generateFooterSection(): string {
        return `\n---\n*Generated automatically by Project Brain.*\n`;
    }

    async getTemplateBody(): Promise<string> {
        const { McpToolRegistry } = await import("../mcp-server/index.js");
        const tools = McpToolRegistry.list();

        let body = `# Project Brain Rules\n\n`;
        body += this.generateOverviewSection() + "\n";
        body += this.generateOperatingProcedureSection(tools) + "\n";
        body += this.generateRulesSection() + "\n";
        body += this.generateRepositoryPolicySection() + "\n";
        body += await this.generateMCPToolsSection(tools) + "\n";
        body += this.generateDecisionTreeSection(tools) + "\n";
        body += this.generateWorkflowExamplesSection(tools) + "\n";
        body += this.generateEfficiencySection(tools) + "\n";
        body += this.generateFAQSection() + "\n";
        body += this.generateFooterSection();
        return body;
    }

    calculateHash(content: string): string {
        return crypto.createHash("sha256").update(content.trim()).digest("hex");
    }

    async ensureSkillFile(): Promise<void> {
        const targetPath = this.skillFilePath;
        const body = await this.getTemplateBody();
        const currentHash = this.calculateHash(body);
        const newFileContent = this.generateHeaderSection(currentHash) + body;

        const fileExists = await this.fs.exists(targetPath);
        if (!fileExists) {
            await this.fs.writeText(targetPath, newFileContent);
            return;
        }

        const existingContent = await this.fs.readText(targetPath);
        const parsed = this.parseFrontmatter(existingContent);

        if (!parsed.hash) {
            // No hash found (assumed custom/modified by user)
            return;
        }

        const calculatedExistingHash = this.calculateHash(parsed.body);
        if (calculatedExistingHash === parsed.hash) {
            // User has not modified the body content, safe to upgrade
            await this.fs.writeText(targetPath, newFileContent);
        }
    }

    private parseFrontmatter(content: string): { hash: string | null; body: string } {
        const trimmed = content.trim();
        if (!trimmed.startsWith("---")) {
            return { hash: null, body: content };
        }
        const parts = content.split("---");
        if (parts.length < 3) {
            return { hash: null, body: content };
        }
        const yaml = parts[1];
        const body = parts.slice(2).join("---").trim();
        const hashMatch = yaml.match(/hash:\s*["']?([a-f0-9]+)["']?/i);
        return {
            hash: hashMatch ? hashMatch[1] : null,
            body
        };
    }
}
