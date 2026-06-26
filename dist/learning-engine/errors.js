// ──────────────────────────────────────────────────────────────────────────────
// BUILD-052 — Learning Engine — Errors
// ──────────────────────────────────────────────────────────────────────────────
export class LearningEngineError extends Error {
    code;
    constructor(message, code = "LEARNING_ENGINE_ERROR") {
        super(message);
        this.code = code;
        this.name = "LearningEngineError";
    }
}
export class LearningStorageError extends LearningEngineError {
    constructor(message) {
        super(message, "LEARNING_STORAGE_ERROR");
        this.name = "LearningStorageError";
    }
}
export class LearningAnalysisError extends LearningEngineError {
    constructor(message) {
        super(message, "LEARNING_ANALYSIS_ERROR");
        this.name = "LearningAnalysisError";
    }
}
export class PatternExtractionError extends LearningEngineError {
    constructor(message) {
        super(message, "PATTERN_EXTRACTION_ERROR");
        this.name = "PatternExtractionError";
    }
}
export class OptimizationError extends LearningEngineError {
    constructor(message) {
        super(message, "OPTIMIZATION_ERROR");
        this.name = "OptimizationError";
    }
}
