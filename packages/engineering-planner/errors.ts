export class EngineeringPlannerError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "EngineeringPlannerError";
    }
}
