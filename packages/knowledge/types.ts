export interface KnowledgeFile {

    path: string;

    title: string;

    createdAt: string;

}

export interface KnowledgeIndex {

    files: KnowledgeFile[];

}
