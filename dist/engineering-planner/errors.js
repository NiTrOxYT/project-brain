export class EngineeringPlannerError extends Error {
    constructor(message) {
        super(message);
        this.name = "EngineeringPlannerError";
    }
}
