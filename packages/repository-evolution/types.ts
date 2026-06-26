export interface GitCommit {
    hash: string;
    parentHashes: string[];
    authorName: string;
    authorEmail: string;
    date: string;
    message: string;
    files: { path: string; status: string; oldPath?: string }[];
}

export interface EvolutionHistory {
    version: number;
    generatedAt: string;
    repositoryHash: string;
    commits: GitCommit[];
}

export interface FileAnalytics {
    path: string;
    firstAppearance: string;
    lastModification: string;
    commitCount: number;
    churnScore: number;
    activeContributors: number;
    averageIntervalMs: number;
    primaryOwner: string;
    secondaryOwners: string[];
    ownershipConfidence: number;
    recentlyChanged: boolean;
    stableModule: boolean;
    frequentlyChanging: boolean;
    abandonedModule: boolean;
}

export interface CoChangeAnalytics {
    fileA: string;
    fileB: string;
    count: number;
}

export interface EvolutionAnalytics {
    version: number;
    generatedAt: string;
    repositoryHash: string;
    fileHistory: FileAnalytics[];
    coChangeRelationships: CoChangeAnalytics[];
}
