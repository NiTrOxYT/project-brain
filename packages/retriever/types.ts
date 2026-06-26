export interface RetrieveRequest {

    query: string;

    limit?: number;

}

export interface RetrievedFile {

    path: string;

    score: number;

    reasons: string[];

}

export interface RetrieveResult {

    files: RetrievedFile[];

}
