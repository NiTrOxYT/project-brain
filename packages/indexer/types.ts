export interface IndexedFile {

    path: string;

    extension: string;

    size: number;

    modifiedAt: string;

}

export interface IndexResult {

    files: IndexedFile[];

}
