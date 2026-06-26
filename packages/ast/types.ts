import ts from "typescript";

export interface ParsedSourceFile {

    path: string;

    source: string;

    ast: ts.SourceFile;

}
