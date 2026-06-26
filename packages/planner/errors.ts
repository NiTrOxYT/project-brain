export class PlannerError extends Error {

    constructor(message: string) {

        super(message);

        this.name = "PlannerError";

    }

}
