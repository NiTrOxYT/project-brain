export class PromptEngineError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PromptEngineError";
    }
}

export class PromptAssemblyError extends PromptEngineError {
    constructor(message: string) {
        super(message);
        this.name = "PromptAssemblyError";
    }
}

export class PromptBudgetError extends PromptEngineError {
    constructor(message: string) {
        super(message);
        this.name = "PromptBudgetError";
    }
}

export class PromptTemplateError extends PromptEngineError {
    constructor(message: string) {
        super(message);
        this.name = "PromptTemplateError";
    }
}

export class PromptOptimizationError extends PromptEngineError {
    constructor(message: string) {
        super(message);
        this.name = "PromptOptimizationError";
    }
}

export class PromptValidationError extends PromptEngineError {
    constructor(message: string) {
        super(message);
        this.name = "PromptValidationError";
    }
}

export class PromptCacheError extends PromptEngineError {
    constructor(message: string) {
        super(message);
        this.name = "PromptCacheError";
    }
}

export class PromptRenderError extends PromptEngineError {
    constructor(message: string) {
        super(message);
        this.name = "PromptRenderError";
    }
}
