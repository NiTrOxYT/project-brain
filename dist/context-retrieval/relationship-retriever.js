export class RelationshipRetriever {
    retrieve(snapshot, targetFiles) {
        const result = [];
        const seen = new Set();
        const fileSet = new Set(targetFiles.map(f => f.replace(/\\/g, "/")));
        for (const rel of snapshot.relationships) {
            const key = `${rel.subject}|${rel.predicate}|${rel.object}`;
            if (seen.has(key))
                continue;
            const subMatch = [...fileSet].some(f => rel.subject.replace(/\\/g, "/").endsWith(f));
            const objMatch = [...fileSet].some(f => rel.object.replace(/\\/g, "/").endsWith(f));
            if (subMatch || objMatch) {
                result.push(rel);
                seen.add(key);
            }
        }
        return result.sort((a, b) => {
            const sComp = a.subject.localeCompare(b.subject);
            if (sComp !== 0)
                return sComp;
            return a.object.localeCompare(b.object);
        });
    }
}
