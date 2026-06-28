import type { McpTool } from "./types.js";

export class McpToolRegistry {
    private static tools: Map<string, McpTool> = new Map();

    static register(tool: McpTool): void {
        this.tools.set(tool.name, tool);
    }

    static unregister(name: string): void {
        this.tools.delete(name);
    }

    static get(name: string): McpTool | undefined {
        return this.tools.get(name);
    }

    static list(): McpTool[] {
        return Array.from(this.tools.values());
    }

    static clear(): void {
        this.tools.clear();
    }
}
