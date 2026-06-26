export class WorkspaceError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkspaceError";
    }
}
