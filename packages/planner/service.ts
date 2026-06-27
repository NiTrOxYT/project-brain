import path from "path";

import { FileSystemService } from "../filesystem/index.js";
import { normalize } from "../semantic/index.js";

import {
    ExecutionIntent,
    ExecutionPlan
} from "./types.js";

interface SemanticEntry {

    file: string;

    terms: string[];

}

interface SemanticIndex {

    entries: SemanticEntry[];

}

export class PlannerService {

    private readonly filesystem =
        new FileSystemService();

    constructor(
        private readonly workspaceRoot: string
    ) {}

    async plan(
        query: string
    ): Promise<ExecutionPlan> {

        const normalized =
            query.trim().toLowerCase();

        const keywords =
            normalize(query);

        const semantic =
            await this.filesystem.readJson<SemanticIndex>(
                path.join(
                    this.workspaceRoot,
                    "index",
                    "semantic.json"
                )
            );

        const modules =
            new Map<string, number>();

        for (const entry of semantic.entries) {

            let score = 0;

            for (const keyword of keywords) {

                if (
                    entry.terms.includes(keyword)
                ) {

                    score++;

                }

            }

            if (score > 0) {

                modules.set(

                    entry.file,

                    score

                );

            }

        }

        const targetModules =
            [...modules.entries()]
                .sort(
                    (a, b) =>
                        b[1] - a[1]
                )
                .slice(0, 12)
                .map(
                    module => module[0]
                );

        const intent =
            this.detectIntent(
                normalized
            );

        const contextBudget =
            this.calculateBudget(
                intent
            );

        return {

            originalQuery:
                query,

            normalizedQuery:
                normalized,

            intent,

            keywords,

            targetModules,

            contextBudget,

            confidence:
                targetModules.length > 0
                    ? 0.95
                    : 0.60

        };

    }

    private detectIntent(
        query: string
    ): ExecutionIntent {

        if (
            /(add|create|implement|build)/.test(query)
        ) {

            return "feature";

        }

        if (
            /(fix|bug|issue|error|resolve)/.test(query)
        ) {

            return "bugfix";

        }

        if (
            /(refactor|cleanup|optimize)/.test(query)
        ) {

            return "refactor";

        }

        if (
            /(test|spec)/.test(query)
        ) {

            return "test";

        }

        if (
            /(document|docs|documentation)/.test(query)
        ) {

            return "documentation";

        }

        return "analysis";

    }

    private calculateBudget(
        intent: ExecutionIntent
    ): number {

        switch (intent) {

            case "bugfix":
                return 8;

            case "feature":
                return 12;

            case "refactor":
                return 16;

            case "test":
                return 6;

            case "documentation":
                return 4;

            default:
                return 10;

        }

    }

}
