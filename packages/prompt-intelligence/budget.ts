import { PromptSection, PromptTokenBudget, PromptProviderProfile } from "./types";
import { PromptRenderer } from "./renderer";

export class PromptBudgeter {
    private readonly renderer = new PromptRenderer();

    budget(
        sections: PromptSection[],
        profile: PromptProviderProfile
    ): {
        budgetedSections: PromptSection[];
        budget: PromptTokenBudget;
    } {
        const maxTokens = profile.contextWindow;

        // Estimate tokens using deterministic estimation: Math.ceil(characters / 4)
        const estimateTokens = (secs: PromptSection[]): number => {
            const rendered = this.renderer.render(secs, profile);
            return Math.ceil(rendered.length / 4);
        };

        // Priority 1 to 10
        const getPriority = (sectionId: string): number => {
            const id = sectionId.toLowerCase();
            if (id.includes("system")) return 1;
            if (id.includes("provider-rules") || id.includes("provider-rule")) return 2;
            if (id.includes("rule")) return 2;
            if (id.includes("task") || id.includes("instruction") || id.includes("template")) return 3;
            if (id.includes("constraint")) return 4;
            if (id.includes("arch")) return 5;
            if (id.includes("learn") || id.includes("history")) return 6;
            if (id.includes("file") || id.includes("symbol") || id.includes("code")) return 7;
            if (id.includes("relation")) return 8;
            if (id.includes("graph")) return 9;
            if (id.includes("val")) return 10;
            return 11; // Fallback
        };

        const MANDATORY_PRIORITIES = new Set([1, 3, 4]);
        const TRUNCATABLE_PRIORITIES = new Set([6, 7, 8, 9]);

        const truncatedSections: string[] = [];
        const removedSections: string[] = [];

        // Sort sections deterministically by priority rank ascending
        // Resolve ties using section ID to ensure deterministic stable sorting
        const sortedSections = [...sections].sort((a, b) => {
            const priA = getPriority(a.id);
            const priB = getPriority(b.id);
            if (priA !== priB) {
                return priA - priB;
            }
            return a.id.localeCompare(b.id);
        });

        // Compute original tokens
        const originalTokens = estimateTokens(sortedSections);

        // Separate mandatory and non-mandatory
        const mandatorySections = sortedSections.filter(s => MANDATORY_PRIORITIES.has(getPriority(s.id)));
        const nonMandatorySections = sortedSections.filter(s => !MANDATORY_PRIORITIES.has(getPriority(s.id)));

        // If mandatory sections alone exceed the limit, compress them as a last resort
        let finalMandatory = mandatorySections.map(s => ({ ...s }));
        let mandatoryTokens = estimateTokens(finalMandatory);

        if (mandatoryTokens > maxTokens) {
            for (let i = 0; i < finalMandatory.length; i++) {
                const sec = finalMandatory[i];
                if (sec.content.length > 200) {
                    const compressed = sec.content.slice(0, 80) + "\n... [Content Compressed to save tokens] ...\n" + sec.content.slice(-80);
                    finalMandatory[i] = { ...sec, content: compressed };
                    truncatedSections.push(sec.name);
                }
            }
            mandatoryTokens = estimateTokens(finalMandatory);
        }

        const budgetedSections: PromptSection[] = [];
        let remainingMandatory = [...finalMandatory];

        for (const sec of sortedSections) {
            if (MANDATORY_PRIORITIES.has(getPriority(sec.id))) {
                const mandIndex = remainingMandatory.findIndex(m => m.id === sec.id);
                if (mandIndex !== -1) {
                    const mandSec = remainingMandatory[mandIndex];
                    budgetedSections.push(mandSec);
                    remainingMandatory.splice(mandIndex, 1);
                }
            } else {
                const testFully = [...budgetedSections, sec, ...remainingMandatory];
                const tokensFully = estimateTokens(testFully);

                if (tokensFully <= maxTokens) {
                    budgetedSections.push({ ...sec });
                } else {
                    const priority = getPriority(sec.id);
                    const suffix = "\n... [Truncated due to token budget limit] ...\n";
                    if (TRUNCATABLE_PRIORITIES.has(priority) && sec.content.length > suffix.length) {
                        let low = 0;
                        let high = sec.content.length;
                        let bestContent = "";

                        while (low <= high) {
                            const mid = Math.floor((low + high) / 2);
                            const candidateContent = sec.content.slice(0, mid) + suffix;
                            const candidateSec = { ...sec, content: candidateContent };
                            const testTruncated = [...budgetedSections, candidateSec, ...remainingMandatory];
                            const tokensTruncated = estimateTokens(testTruncated);

                            if (tokensTruncated <= maxTokens) {
                                bestContent = candidateContent;
                                low = mid + 1;
                            } else {
                                high = mid - 1;
                            }
                        }

                        if (bestContent.length > 0) {
                            budgetedSections.push({
                                ...sec,
                                content: bestContent
                            });
                            truncatedSections.push(sec.name);
                        } else {
                            removedSections.push(sec.name);
                        }
                    } else {
                        removedSections.push(sec.name);
                    }
                }
            }
        }

        // Sort budgeted sections to final priority order
        budgetedSections.sort((a, b) => {
            const priA = getPriority(a.id);
            const priB = getPriority(b.id);
            if (priA !== priB) {
                return priA - priB;
            }
            return a.id.localeCompare(b.id);
        });

        const finalRendered = this.renderer.render(budgetedSections, profile);
        const actualTokens = Math.ceil(finalRendered.length / 4);

        const allocatedTokens = {
            systemPrompt: 0,
            architecture: 0,
            relevantFiles: 0,
            relationships: 0,
            executionGraph: 0,
            memory: 0,
            learning: 0,
            taskInstructions: 0,
            validationRules: 0
        };

        for (const sec of budgetedSections) {
            this.updateAllocation(allocatedTokens, sec.id, sec.content.length);
        }

        const remainingBudget = maxTokens - actualTokens;
        const compressionRatio = originalTokens > 0 ? actualTokens / originalTokens : 1.0;

        return {
            budgetedSections,
            budget: {
                maxTokens,
                allocatedTokens,
                actualTokens,
                originalTokens,
                providerLimit: maxTokens,
                compressionRatio: Number(compressionRatio.toFixed(4)),
                removedSections,
                truncatedSections,
                remainingBudget
            }
        };
    }

    private updateAllocation(allocated: PromptTokenBudget["allocatedTokens"], sectionId: string, charLength: number) {
        const tokens = Math.ceil(charLength / 4);
        const norm = sectionId.toLowerCase();

        if (norm.includes("system")) {
            allocated.systemPrompt += tokens;
        } else if (norm.includes("provider-rules") || norm.includes("rule")) {
            allocated.validationRules += tokens;
        } else if (norm.includes("arch")) {
            allocated.architecture += tokens;
        } else if (norm.includes("task") || norm.includes("instruction") || norm.includes("template")) {
            allocated.taskInstructions += tokens;
        } else if (norm.includes("file") || norm.includes("code")) {
            allocated.relevantFiles += tokens;
        } else if (norm.includes("symbol")) {
            allocated.relevantFiles += tokens;
        } else if (norm.includes("relation")) {
            allocated.relationships += tokens;
        } else if (norm.includes("graph")) {
            allocated.executionGraph += tokens;
        } else if (norm.includes("learn") || norm.includes("history")) {
            allocated.learning += tokens;
        } else if (norm.includes("val")) {
            allocated.validationRules += tokens;
        } else {
            allocated.memory += tokens;
        }
    }
}
