export interface RuntimeArtifact {
    id: string;
    taskId: string;
    type: "code" | "patch" | "test" | "documentation" | "log" | "diagnostic";
    path?: string;
    content: string;
    metadata?: Record<string, any>;
    version?: string;
    createdAt?: string;
    provider?: string;
    checksum?: string;
    hash?: string;
}
