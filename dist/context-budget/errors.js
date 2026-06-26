export class ContextBudgetError extends Error {
    constructor(message) {
        super(message);
        this.name = "ContextBudgetError";
    }
}
