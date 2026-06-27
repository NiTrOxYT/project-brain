export interface ContextRequest {
    providerId:          string;
    query:               string;
    workspaceRoot:       string;
    snapshotId:          string;
    maxTokens:           number;
    openFiles:           string[];
    recentlyEditedFiles: string[];
    cursorFile?:         string;
    cursorRange?: {
        start: number;
        end: number;
    };
}

export interface RankedFile {
    path:        string;
    score:       number;
    reasons:     string[];
    tokenCount?: number;
}

export interface MemoryEntry {
    id:         string;
    type:       string;
    content:    string;
    confidence: number;
}

export interface ContextSnippet {
    path:    string;
    code:    string;
    comment: string;
}

export interface DependencySummary {
    file:     string;
    imports:  string[];
    exports?: string[];
}

export interface ContextResponse {
    architectureSummary: string;
    rankedFiles:         RankedFile[];
    semanticMemory:      MemoryEntry[];
    snippets:            ContextSnippet[];
    dependencySummary:   DependencySummary[];
    estimatedTokens:     number;
    confidence:          number;
    retrievalTimeMs:     number;
}
