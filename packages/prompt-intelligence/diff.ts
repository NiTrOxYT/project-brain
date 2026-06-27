import { PromptPackage } from "./types.js";

export interface PromptDiffResult {
    addedSections: string[];
    removedSections: string[];
    changedSections: string[];
    tokenDelta: number;
    addedLines: number;
}

export class PromptDiffEngine {
    diff(v1: PromptPackage, v2: PromptPackage): PromptDiffResult {
        // v1 can be null if comparing new prompt
        const v1Sections = this.parseSections(v1?.renderedPrompt || "");
        const v2Sections = this.parseSections(v2?.renderedPrompt || "");

        const addedSections: string[] = [];
        const removedSections: string[] = [];
        const changedSections: string[] = [];

        // Check for added/changed
        for (const [name, content2] of Object.entries(v2Sections)) {
            const content1 = v1Sections[name];
            if (content1 === undefined) {
                addedSections.push(name);
            } else if (content1 !== content2) {
                changedSections.push(name);
            }
        }

        // Check for removed
        for (const name of Object.keys(v1Sections)) {
            if (v2Sections[name] === undefined) {
                removedSections.push(name);
            }
        }

        const v1Tokens = v1 ? Math.ceil((v1.renderedPrompt?.length || 0) / 4) : 0;
        const v2Tokens = v2 ? Math.ceil((v2.renderedPrompt?.length || 0) / 4) : 0;
        const tokenDelta = v2Tokens - v1Tokens;

        const lines1 = (v1?.renderedPrompt || "").split("\n");
        const lines2 = (v2?.renderedPrompt || "").split("\n");
        const addedLines = Math.max(0, lines2.length - lines1.length);

        return {
            addedSections,
            removedSections,
            changedSections,
            tokenDelta,
            addedLines
        };
    }

    private parseSections(renderedPrompt: string): Record<string, string> {
        // Parse section structures: we can check for Claude style "[Section Name]"
        // or Gemini "<section id="..." name="...">" or Codex "# Section Name"
        // To be general, we can look for headers or split by sections.
        // Let's do a simple regex block parser.
        const sections: Record<string, string> = {};
        
        // Match [Name] style
        const claudeMatches = [...renderedPrompt.matchAll(/\[([^\]]+)\]\n([\s\S]*?)(?=\n\[|$)/g)];
        if (claudeMatches.length > 0) {
            for (const match of claudeMatches) {
                sections[match[1].trim()] = match[2].trim();
            }
            return sections;
        }

        // Match <section id="..." name="..."> style
        const geminiMatches = [...renderedPrompt.matchAll(/<section id="[^"]+" name="([^"]+)">\n([\s\S]*?)\n<\/section>/g)];
        if (geminiMatches.length > 0) {
            for (const match of geminiMatches) {
                sections[match[1].trim()] = match[2].trim();
            }
            return sections;
        }

        // Match # Name style
        const codexMatches = [...renderedPrompt.matchAll(/# ([^\n]+)\n\n([\s\S]*?)(?=\n# |$)/g)];
        if (codexMatches.length > 0) {
            for (const match of codexMatches) {
                sections[match[1].trim()] = match[2].trim();
            }
            return sections;
        }

        // Fallback: whole prompt as single main section
        sections["main"] = renderedPrompt;
        return sections;
    }
}
