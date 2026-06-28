export class McpToolRegistry {
    static tools = new Map();
    static register(tool) {
        this.tools.set(tool.name, tool);
    }
    static unregister(name) {
        this.tools.delete(name);
    }
    static get(name) {
        return this.tools.get(name);
    }
    static list() {
        return Array.from(this.tools.values());
    }
    static clear() {
        this.tools.clear();
    }
}
