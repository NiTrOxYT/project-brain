export interface Manifest {

    schemaVersion: number;

    brainVersion: string;

    project: {
        id: string;
        name: string;
        framework: string;
        language: string;
        createdAt: string;
        updatedAt: string;
    };

    workspace: {
        knowledge: string;
        graph: string;
        index: string;
        cache: string;
        history: string;
        state: string;
    };

    features: {
        knowledge: boolean;
        graph: boolean;
        index: boolean;
        cache: boolean;
        history: boolean;
        state: boolean;
    };

}
