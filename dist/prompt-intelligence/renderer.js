export class PromptRenderer {
    render(sections, profile) {
        const providerId = profile.providerId;
        switch (providerId) {
            case "claude-code":
                return this.renderClaude(sections);
            case "codex":
                return this.renderCodex(sections);
            case "gemini-cli":
                return this.renderGemini(sections);
            case "ollama":
                return this.renderOllama(sections);
            case "aider":
                return this.renderAider(sections);
            case "opencode":
                return this.renderOpenCode(sections);
            default:
                // Default fallback renderer
                return this.renderDefault(sections);
        }
    }
    renderClaude(sections) {
        return sections.map(s => {
            const tag = s.id.replace(/-/g, "_");
            return `<${tag}>\n${s.content}\n</${tag}>`;
        }).join("\n\n");
    }
    renderCodex(sections) {
        // Markdown style for Codex
        return sections.map(s => {
            return `# ${s.name}\n\n${s.content}`;
        }).join("\n\n");
    }
    renderGemini(sections) {
        // Structured XML-like tagging for Gemini's long context window
        return sections.map(s => {
            const tag = s.id.replace(/[^a-zA-Z0-9]/g, "_");
            return `<section id="${tag}" name="${s.name}">\n${s.content}\n</section>`;
        }).join("\n\n");
    }
    renderOllama(sections) {
        return sections.map(s => {
            return `# ${s.name}\n\n${s.content}`;
        }).join("\n\n");
    }
    renderAider(sections) {
        // Aider focuses on code files and direct prompt instructions
        const instructions = sections.find(s => s.id === "task")?.content || "";
        const files = sections.filter(s => s.id.includes("file") || s.id.includes("code"));
        const others = sections.filter(s => s.id !== "task" && !s.id.includes("file") && !s.id.includes("code"));
        const parts = [];
        if (instructions) {
            parts.push(`INSTRUCTIONS:\n${instructions}`);
        }
        if (files.length > 0) {
            parts.push(`FILES CONTEXT:\n${files.map(f => f.content).join("\n\n")}`);
        }
        if (others.length > 0) {
            parts.push(`ADDITIONAL CONTEXT:\n${others.map(o => o.content).join("\n\n")}`);
        }
        return parts.join("\n\n");
    }
    renderOpenCode(sections) {
        // Strictly structured output formatting for OpenCode
        return sections.map(s => {
            return `// BEGIN SECTION: ${s.name}\n${s.content}\n// END SECTION: ${s.name}`;
        }).join("\n\n");
    }
    renderDefault(sections) {
        return sections.map(s => `[${s.name}]\n${s.content}`).join("\n\n");
    }
}
