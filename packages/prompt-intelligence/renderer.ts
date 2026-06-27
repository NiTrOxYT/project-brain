import { PromptSection, PromptProviderProfile } from "./types.js";
import { PromptRenderError } from "./errors.js";

export class PromptRenderer {
    render(sections: PromptSection[], profile: PromptProviderProfile): string {
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

    private renderClaude(sections: PromptSection[]): string {
        return sections.map(s => {
            const tag = s.id.replace(/-/g, "_");
            return `<${tag}>\n${s.content}\n</${tag}>`;
        }).join("\n\n");
    }

    private renderCodex(sections: PromptSection[]): string {
        // Markdown style for Codex
        return sections.map(s => {
            return `# ${s.name}\n\n${s.content}`;
        }).join("\n\n");
    }

    private renderGemini(sections: PromptSection[]): string {
        // Structured XML-like tagging for Gemini's long context window
        return sections.map(s => {
            const tag = s.id.replace(/[^a-zA-Z0-9]/g, "_");
            return `<section id="${tag}" name="${s.name}">\n${s.content}\n</section>`;
        }).join("\n\n");
    }

    private renderOllama(sections: PromptSection[]): string {
        return sections.map(s => {
            return `# ${s.name}\n\n${s.content}`;
        }).join("\n\n");
    }

    private renderAider(sections: PromptSection[]): string {
        // Aider focuses on code files and direct prompt instructions
        const instructions = sections.find(s => s.id === "task")?.content || "";
        const files = sections.filter(s => s.id.includes("file") || s.id.includes("code"));
        const others = sections.filter(s => s.id !== "task" && !s.id.includes("file") && !s.id.includes("code"));

        const parts: string[] = [];
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

    private renderOpenCode(sections: PromptSection[]): string {
        // Strictly structured output formatting for OpenCode
        return sections.map(s => {
            return `// BEGIN SECTION: ${s.name}\n${s.content}\n// END SECTION: ${s.name}`;
        }).join("\n\n");
    }

    private renderDefault(sections: PromptSection[]): string {
        return sections.map(s => `[${s.name}]\n${s.content}`).join("\n\n");
    }
}
