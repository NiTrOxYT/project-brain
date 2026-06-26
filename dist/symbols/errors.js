export class SymbolsError extends Error {
    constructor(message) {
        super(message);
        this.name = "SymbolsError";
    }
}
