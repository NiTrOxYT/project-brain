// ──────────────────────────────────────────────────────────────────────────────
// BUILD-052 — Learning Engine — Prompt Library
// ──────────────────────────────────────────────────────────────────────────────
import crypto from "crypto";
export class PromptLibrary {
    record(existing, providerId, taskType, promptBody, outcome, validationScore, repairCount, tokens, cost) {
        const library = new Map();
        for (const p of existing) {
            library.set(p.promptHash, { ...p });
        }
        const hash = crypto.createHash("sha256").update(promptBody).digest("hex");
        let item = library.get(hash);
        const isSuccess = outcome === "success";
        if (!item) {
            item = {
                promptHash: hash,
                promptBody,
                providerId,
                taskType,
                successRate: isSuccess ? 100 : 0,
                averageValidationScore: validationScore,
                averageRepairCount: repairCount,
                averageTokens: tokens,
                averageCost: cost,
                useCount: 1
            };
            library.set(hash, item);
        }
        else {
            const n = item.useCount + 1;
            item.useCount = n;
            const currentSuccessCount = (item.successRate / 100) * (n - 1) + (isSuccess ? 1 : 0);
            item.successRate = (currentSuccessCount / n) * 100;
            item.averageValidationScore = (item.averageValidationScore * (n - 1) + validationScore) / n;
            item.averageRepairCount = (item.averageRepairCount * (n - 1) + repairCount) / n;
            item.averageTokens = Math.round((item.averageTokens * (n - 1) + tokens) / n);
            item.averageCost = (item.averageCost * (n - 1) + cost) / n;
        }
        return Array.from(library.values());
    }
}
