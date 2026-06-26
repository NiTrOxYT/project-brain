export type RelationshipType =
    | "contains"
    | "imports"
    | "exports"
    | "extends"
    | "implements"
    | "calls"
    | "references"
    | "constructs";

export interface RelationshipRecord {

    source: string;

    target: string;

    type: RelationshipType;

    file: string;

    line: number;

}

export interface RelationshipIndex {

    generatedAt: string;

    relationships: RelationshipRecord[];

}
