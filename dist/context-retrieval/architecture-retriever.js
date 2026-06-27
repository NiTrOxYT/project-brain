export class ArchitectureRetriever {
    retrieve(snapshot, keywords) {
        const result = [];
        const keywordSet = new Set(keywords.map(k => k.toLowerCase()));
        for (const entry of snapshot.architecture) {
            const catMatch = keywordSet.has(entry.category.toLowerCase());
            const titleMatch = entry.title.split(/\s+/).some(w => keywordSet.has(w.toLowerCase()));
            const tagMatch = entry.tags.some(t => keywordSet.has(t.toLowerCase()));
            if (catMatch || titleMatch || tagMatch || keywords.length === 0) {
                result.push(entry);
            }
        }
        return result.sort((a, b) => {
            const catComp = a.category.localeCompare(b.category);
            if (catComp !== 0)
                return catComp;
            return a.title.localeCompare(b.title);
        });
    }
}
