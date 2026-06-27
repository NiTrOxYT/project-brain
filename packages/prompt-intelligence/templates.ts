import { PromptTemplate } from "./types.js";

export const TEMPLATES: Record<PromptTemplate["type"], string> = {
    Feature: `Task Type: Feature Implementation
Title: \${taskTitle}
Target File: \${taskFile}
Target Symbol: \${taskSymbol}

Please implement the requested feature. Ensure all code is clean, robust, and matches the engineering plan. Expose appropriate unit tests and documentation as necessary.`,

    Bugfix: `Task Type: Bug Fix
Title: \${taskTitle}
Target File: \${taskFile}
Target Symbol: \${taskSymbol}

Please locate and resolve the issue described in the task details. Ensure to verify all edge cases and prevent regressions.`,

    Refactor: `Task Type: Refactoring
Title: \${taskTitle}
Target File: \${taskFile}
Target Symbol: \${taskSymbol}

Please refactor the target module. Focus on improving readability, efficiency, maintainability, and structural integrity without altering the functional behavior.`,

    Repair: `Task Type: Auto-Repair
Title: \${taskTitle}
Original Task: \${originalTaskId} (\${originalTaskTitle})
Failure Category: \${failureCategory}
Failure Message: \${failureMessage}
Failure Details: \${failureDetails}

An execution failure occurred. Please implement the necessary repair/fix. Ensure that compiler, test, or custom validation errors are fully resolved.`,

    Review: `Task Type: Code Review
Title: \${taskTitle}
Target File: \${taskFile}

Please review the changes in the target files. Check for performance issues, security vulnerabilities, logical errors, and style conformance.`,

    Documentation: `Task Type: Documentation
Title: \${taskTitle}
Target File: \${taskFile}

Please generate or update the documentation for the codebase. Ensure clear explanations, examples, and correct API descriptions.`,

    Testing: `Task Type: Test Development
Title: \${taskTitle}
Target File: \${taskFile}
Target Symbol: \TokenSymbol}

Please write unit or integration tests for the target code module. Cover edge cases, success paths, and failure paths.`,

    Validation: `Task Type: Validation
Title: \${taskTitle}
Target File: \${taskFile}

Please validate the codebase or specified module for correctness, performance constraints, and safety guidelines.`,

    Architecture: `Task Type: Architectural Decision
Title: \${taskTitle}

Please formulate or update the architectural decisions. Ensure alignment with the existing architecture and system design patterns.`,

    Analysis: `Task Type: Code Analysis
Title: \${taskTitle}
Target File: \TokenFile}

Please analyze the codebase, structure, or implementation dependencies. Produce detailed diagnostic or architectural reports.`
};

export function getTemplate(type: PromptTemplate["type"]): PromptTemplate {
    const text = TEMPLATES[type] || TEMPLATES["Analysis"];
    return {
        id: `tpl-${type.toLowerCase()}`,
        type,
        templateText: text
    };
}

export function getTemplateForTaskType(taskType: string, isRepair: boolean = false): PromptTemplate {
    if (isRepair) {
        return getTemplate("Repair");
    }
    switch (taskType) {
        case "create":
            return getTemplate("Feature");
        case "modify":
            return getTemplate("Feature");
        case "refactor":
            return getTemplate("Refactor");
        case "test":
            return getTemplate("Testing");
        case "document":
            return getTemplate("Documentation");
        case "validate":
            return getTemplate("Validation");
        case "analyze":
            return getTemplate("Analysis");
        case "cleanup":
            return getTemplate("Refactor");
        default:
            // Match substring or default
            const upper = taskType.toUpperCase();
            if (upper.includes("BUG") || upper.includes("FIX")) return getTemplate("Bugfix");
            if (upper.includes("REVIEW")) return getTemplate("Review");
            if (upper.includes("ARCH")) return getTemplate("Architecture");
            return getTemplate("Analysis");
    }
}

export function renderTemplate(templateText: string, variables: Record<string, string>): string {
    let result = templateText;
    for (const [key, val] of Object.entries(variables)) {
        result = result.replace(new RegExp(`\\$\\{${key}\\}`, "g"), val || "");
    }
    return result;
}
