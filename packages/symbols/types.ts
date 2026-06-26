export interface SymbolRecord {

    name: string;

    kind: "class" | "function" | "interface" | "type" | "enum" | "variable";

    file: string;

    line: number;

}

export interface SymbolIndex {

    generatedAt: string;

    symbols: SymbolRecord[];

}
