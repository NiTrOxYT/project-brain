export interface SemanticEntry {

    id: string;

    file: string;

    terms: string[];

    weight: number;

}

export interface SemanticIndex {

    generatedAt: string;

    entries: SemanticEntry[];

}
