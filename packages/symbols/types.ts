export type SymbolKind =

    | "class"
    | "interface"
    | "type"
    | "enum"
    | "function"
    | "method"
    | "constructor"
    | "property"
    | "variable";

export interface SymbolRecord {

    name: string;

    kind: SymbolKind;

    file: string;

    line: number;

}

export interface SymbolIndex {

    generatedAt: string;

    symbols: SymbolRecord[];

}