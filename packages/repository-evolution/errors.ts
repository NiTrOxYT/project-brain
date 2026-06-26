export class RepositoryEvolutionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "RepositoryEvolutionError";
    }
}
