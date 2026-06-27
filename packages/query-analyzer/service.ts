import { QueryAnalysis } from "./types.js";

const STOP_WORDS = new Set([
    "add",
    "create",
    "make",
    "update",
    "modify",
    "change",
    "fix",
    "remove",
    "delete",
    "implement",
    "build",
    "the",
    "a",
    "an",
    "to",
    "for",
    "of",
    "in",
    "on",
    "with"
]);

export class QueryAnalyzerService {

    analyze(
        query: string
    ): QueryAnalysis {

        const normalized =
            query
                .trim()
                .toLowerCase();

        const tokens =
            normalized
                .split(/\s+/)
                .filter(Boolean);

        const keywords =
            tokens.filter(
                token =>
                    !STOP_WORDS.has(token)
            );

        return {

            original: query,

            normalized,

            tokens,

            keywords

        };

    }

}
