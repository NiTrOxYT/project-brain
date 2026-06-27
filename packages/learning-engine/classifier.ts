// ──────────────────────────────────────────────────────────────────────────────
// BUILD-052 — Learning Engine — Classifier
// ──────────────────────────────────────────────────────────────────────────────

import { LearningCategory, LearningExperience } from "./types.js";

export class LearningClassifier {
    classify(exp: LearningExperience): LearningCategory {
        // 1. Analyze errors first for precise error classification
        if (exp.errors && exp.errors.length > 0) {
            const errorStr = exp.errors.join(" ").toLowerCase();
            
            if (errorStr.includes("timeout") || errorStr.includes("timed out")) {
                return "Timeout";
            }
            if (errorStr.includes("cancel") || errorStr.includes("abort")) {
                return "Cancellation";
            }
            if (errorStr.includes("tsc") || errorStr.includes("compile") || errorStr.includes("syntax error") || errorStr.includes("typescript")) {
                return "Compilation";
            }
            if (errorStr.includes("test") || errorStr.includes("assert") || errorStr.includes("expect") || errorStr.includes("spec")) {
                return "Test";
            }
            if (errorStr.includes("package.json") || errorStr.includes("npm") || errorStr.includes("dependency") || errorStr.includes("import") || errorStr.includes("cannot find module")) {
                return "Dependency";
            }
            if (errorStr.includes("prettier") || errorStr.includes("eslint") || errorStr.includes("format") || errorStr.includes("lint")) {
                return "Formatting";
            }
            if (errorStr.includes("workspace") || errorStr.includes("transaction") || errorStr.includes("lock") || errorStr.includes("filesystem")) {
                return "Workspace";
            }
            if (errorStr.includes("provider") || errorStr.includes("auth") || errorStr.includes("key") || errorStr.includes("rate limit")) {
                return "Provider";
            }
            if (errorStr.includes("architecture") || errorStr.includes("layer") || errorStr.includes("dependency violation")) {
                return "Architecture";
            }
        }

        // 2. Classify based on task title / type / metadata
        const title = (exp.taskTitle || "").toLowerCase();
        const type = (exp.taskType || "").toLowerCase();

        if (title.includes("test") || title.includes("spec") || type === "test") {
            return "Test";
        }
        if (title.includes("compile") || title.includes("build") || title.includes("tsc")) {
            return "Compilation";
        }
        if (title.includes("refactor") || type === "refactor") {
            return "Refactor";
        }
        if (title.includes("document") || title.includes("readme") || title.includes("markdown") || type === "document") {
            return "Documentation";
        }
        if (title.includes("fix") || title.includes("bug") || title.includes("repair")) {
            return "Bugfix";
        }
        if (title.includes("feat") || title.includes("add") || title.includes("implement") || title.includes("create") || type === "create") {
            return "Feature";
        }
        if (title.includes("eslint") || title.includes("prettier") || title.includes("format") || type === "cleanup") {
            return "Formatting";
        }
        if (title.includes("dependency") || title.includes("npm") || title.includes("install")) {
            return "Dependency";
        }
        if (title.includes("architect") || title.includes("structure") || title.includes("design")) {
            return "Architecture";
        }
        if (title.includes("workspace") || title.includes("file")) {
            return "Workspace";
        }

        return "Runtime";
    }
}
