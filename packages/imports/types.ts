export interface ImportRecord {

    source: string;

    target: string;

}

export interface ImportIndex {

    generatedAt: string;

    imports: ImportRecord[];

}
