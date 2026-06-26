export class RepositoryEvolutionError extends Error {
    constructor(message) {
        super(message);
        this.name = "RepositoryEvolutionError";
    }
}
