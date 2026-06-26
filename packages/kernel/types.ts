export interface BrainPaths {
    root: string;

    brain: string;

    memory: string;

    graph: string;

    cache: string;

    tasks: string;
}

export interface RuntimeContext {
    cwd: string;

    initialized: boolean;

    paths: BrainPaths;
}
