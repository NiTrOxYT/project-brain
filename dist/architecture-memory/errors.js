export class ArchitectureMemoryError extends Error {
    constructor(message) {
        super(message);
        this.name = "ArchitectureMemoryError";
    }
}
