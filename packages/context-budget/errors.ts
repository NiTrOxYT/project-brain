export class ContextBudgetError extends Error {

    constructor(message: string) {

        super(message);

        this.name = "ContextBudgetError";

    }

}
