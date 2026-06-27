export class ContextRetrievalError extends Error {
    constructor(message) {
        super(message);
        this.name = "ContextRetrievalError";
    }
}
export class RetrievalBudgetError extends ContextRetrievalError {
    constructor(message) {
        super(message);
        this.name = "RetrievalBudgetError";
    }
}
export class GraphTraversalError extends ContextRetrievalError {
    constructor(message) {
        super(message);
        this.name = "GraphTraversalError";
    }
}
export class RetrievalValidationError extends ContextRetrievalError {
    constructor(message) {
        super(message);
        this.name = "RetrievalValidationError";
    }
}
export class RankingError extends ContextRetrievalError {
    constructor(message) {
        super(message);
        this.name = "RankingError";
    }
}
export class CompressionError extends ContextRetrievalError {
    constructor(message) {
        super(message);
        this.name = "CompressionError";
    }
}
export class RetrievalCacheError extends ContextRetrievalError {
    constructor(message) {
        super(message);
        this.name = "RetrievalCacheError";
    }
}
