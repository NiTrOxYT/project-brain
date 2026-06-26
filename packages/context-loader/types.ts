export interface ContextRequest {

    query: string;

}

export interface ContextBundle {

    query: string;

    project: any;

    files: any[];

    symbols: any[];

    imports: any[];

}
