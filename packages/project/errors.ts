export class ProjectError extends Error {

    constructor(message: string) {

        super(message);

        this.name = "ProjectError";

    }

}
