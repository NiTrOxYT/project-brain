export class ProjectError extends Error {
    constructor(message) {
        super(message);
        this.name = "ProjectError";
    }
}
