export class ExecutionGraphError extends Error {

    constructor(message: string) {

        super(message);

        this.name = "ExecutionGraphError";

    }

}
