export class PlannerError extends Error {
    constructor(message) {
        super(message);
        this.name = "PlannerError";
    }
}
