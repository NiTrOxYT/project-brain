export type ArchitectureCategory =
    | "decision"
    | "module"
    | "ownership"
    | "convention"
    | "invariant"
    | "workflow"
    | "note"
    | "adr";

export type ArchitectureSource = "user" | "generated" | "imported" | "adr";

export interface ArchitectureEntry {

    id: string;

    title: string;

    category: ArchitectureCategory | string;

    description: string;

    tags: string[];

    relatedFiles: string[];

    relatedSymbols: string[];

    createdAt: string;

    updatedAt: string;

    source: ArchitectureSource;

    confidence: number;

}

export interface ArchitectureMemory {

    generatedAt: string;

    version: number;

    entries: ArchitectureEntry[];

}

export interface MemoryMetadata {
    version: number;
    nextArchitectureId: number;
}
