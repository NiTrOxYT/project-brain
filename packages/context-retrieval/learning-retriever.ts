import { SemanticSnapshot, SnapshotLearningEntry } from "../context-compiler/types";

export class LearningRetriever {
    retrieve(snapshot: SemanticSnapshot, intent: string, targetFiles: string[]): SnapshotLearningEntry[] {
        const result: SnapshotLearningEntry[] = [];
        const files = new Set(targetFiles.map(f => f.replace(/\\/g, "/")));

        for (const exp of snapshot.learning) {
            const intentMatch = exp.taskType.toLowerCase() === intent.toLowerCase();
            const fileMatch = exp.filesModified.some(fm =>
                [...files].some(f => fm.replace(/\\/g, "/").endsWith(f))
            );

            if (intentMatch || fileMatch || targetFiles.length === 0) {
                result.push(exp);
            }
        }

        return result.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }
}
