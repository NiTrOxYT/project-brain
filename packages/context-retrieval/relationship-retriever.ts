import { SemanticSnapshot, SnapshotRelationship } from "../context-compiler/types.js";

export class RelationshipRetriever {
    retrieve(snapshot: SemanticSnapshot, targetFiles: string[]): SnapshotRelationship[] {
        const result: SnapshotRelationship[] = [];
        const seen = new Set<string>();

        const fileSet = new Set(targetFiles.map(f => f.replace(/\\/g, "/")));

        for (const rel of snapshot.relationships) {
            const key = `${rel.subject}|${rel.predicate}|${rel.object}`;
            if (seen.has(key)) continue;

            const subMatch = [...fileSet].some(f => rel.subject.replace(/\\/g, "/").endsWith(f));
            const objMatch = [...fileSet].some(f => rel.object.replace(/\\/g, "/").endsWith(f));

            if (subMatch || objMatch) {
                result.push(rel);
                seen.add(key);
            }
        }

        return result.sort((a, b) => {
            const sComp = a.subject.localeCompare(b.subject);
            if (sComp !== 0) return sComp;
            return a.object.localeCompare(b.object);
        });
    }
}
