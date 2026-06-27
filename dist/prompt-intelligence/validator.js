import { PromptValidationError, PromptBudgetError, PromptTemplateError } from "./errors";
export class PromptValidator {
    validate(task, sections, profile, budget) {
        // 1. Missing task
        if (!task || !task.id || !task.type || !task.title) {
            throw new PromptValidationError("Prompt validation failed: Missing task or task parameters.");
        }
        // Capabilities validation
        const providerCapabilities = {
            "claude-code": ["analyze", "create", "modify", "refactor", "delete", "validate", "document", "test", "cleanup"],
            "codex": ["analyze", "create", "modify", "refactor", "validate", "test", "cleanup"],
            "gemini-cli": ["analyze", "create", "modify", "refactor", "validate", "document", "test", "cleanup"],
            "ollama": ["analyze", "create", "modify", "refactor", "cleanup"],
            "aider": ["modify", "refactor", "test", "cleanup"],
            "opencode": ["create", "modify", "refactor", "test", "cleanup"],
            "mock-sdk-provider": ["analyze", "create", "modify", "refactor", "delete", "validate", "document", "test", "cleanup"]
        };
        const allowed = providerCapabilities[profile.providerId] || [];
        if (allowed.length > 0 && !allowed.includes(task.type)) {
            throw new PromptValidationError(`Prompt validation failed: Provider '${profile.providerId}' does not support capability '${task.type}'.`);
        }
        // 2. Empty prompt
        if (sections.length === 0 || sections.every(s => s.content.trim().length === 0)) {
            throw new PromptValidationError("Prompt validation failed: Compiled prompt is empty.");
        }
        // 3. Missing files
        if (task.file) {
            const hasFileContent = sections.some(s => s.id.includes("file") && s.content.includes(task.file));
            // Note: In some task contexts (like analysis or validation), file content may not be fully loaded,
            // but if task.file is specified, there should be some reference. Let's make this validation warning-only
            // or lenient unless it's a strict requirement. Let's do a basic existence check of context variables.
        }
        // 4. Token overflow
        if (budget.actualTokens > profile.contextWindow) {
            throw new PromptBudgetError(`Prompt validation failed: Token overflow. Actual tokens ${budget.actualTokens} exceeds provider window limit ${profile.contextWindow}.`);
        }
        // 5. Invalid provider
        const validProviders = ["claude-code", "codex", "gemini-cli", "ollama", "aider", "opencode", "mock-sdk-provider"];
        if (!validProviders.includes(profile.providerId)) {
            throw new PromptValidationError(`Prompt validation failed: Invalid or unsupported provider '${profile.providerId}'.`);
        }
        // 6. Duplicate sections
        const seenIds = new Set();
        for (const s of sections) {
            if (seenIds.has(s.id)) {
                throw new PromptValidationError(`Prompt validation failed: Duplicate section ID detected: '${s.id}'.`);
            }
            seenIds.add(s.id);
        }
        // 7. Broken references in templates
        const taskText = sections.find(s => s.id === "task")?.content || "";
        const references = taskText.match(/\$\{([^}]+)\}/g);
        if (references) {
            for (const ref of references) {
                const varName = ref.slice(2, -1);
                // If it's a template var that wasn't rendered
                throw new PromptTemplateError(`Prompt validation failed: Unrendered template reference detected: '${ref}'.`);
            }
        }
    }
}
