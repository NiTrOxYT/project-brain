export interface SynchronizationState {

    generatedAt: string;

    scannedFiles: number;

    changedFiles: string[];

    addedFiles: string[];

    removedFiles: string[];

    updatedIndexes: string[];

}
