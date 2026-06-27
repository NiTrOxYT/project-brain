import { PromptRanking } from "./types";

export class PromptSectionRanker {
    private static readonly SECTION_SCORES: Record<string, number> = {
        "system": 100,
        "provider-rules": 99,
        "architecture": 98,
        "task": 95,
        "files": 90,
        "symbols": 85,
        "relationships": 70,
        "execution-graph": 60,
        "learning": 50,
        "validation": 40,
        "history": 35
    };

    rankSection(sectionId: string): number {
        const normalized = sectionId.toLowerCase().trim();
        if (PromptSectionRanker.SECTION_SCORES[normalized] !== undefined) {
            return PromptSectionRanker.SECTION_SCORES[normalized];
        }
        // Fallback for custom sections
        if (normalized.includes("system")) return 100;
        if (normalized.includes("rule")) return 99;
        if (normalized.includes("arch")) return 98;
        if (normalized.includes("task") || normalized.includes("instruction")) return 95;
        if (normalized.includes("file") || normalized.includes("code")) return 90;
        if (normalized.includes("symbol")) return 85;
        if (normalized.includes("relation")) return 70;
        if (normalized.includes("graph")) return 60;
        if (normalized.includes("learn")) return 50;
        if (normalized.includes("val")) return 40;
        return 30; // Lowest default priority
    }

    rankSections(sectionIds: string[]): PromptRanking[] {
        return sectionIds.map(id => ({
            sectionId: id,
            score: this.rankSection(id)
        })).sort((a, b) => b.score - a.score);
    }
}
