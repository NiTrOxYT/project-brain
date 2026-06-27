export class SymbolRetriever {
    retrieve(snapshot, querySymbols, targetFiles) {
        const result = [];
        const seen = new Set();
        const symbolNames = new Set(querySymbols.map(s => s.toLowerCase()));
        const fileSet = new Set(targetFiles.map(f => f.replace(/\\/g, "/")));
        for (const s of snapshot.symbols) {
            const key = `${s.filePath}::${s.name}`;
            if (seen.has(key))
                continue;
            const nameMatch = symbolNames.has(s.name.toLowerCase());
            const fileMatch = [...fileSet].some(f => s.filePath.replace(/\\/g, "/").endsWith(f));
            if (nameMatch || fileMatch) {
                result.push(s);
                seen.add(key);
            }
        }
        return result.sort((a, b) => {
            const fComp = a.filePath.localeCompare(b.filePath);
            if (fComp !== 0)
                return fComp;
            return a.name.localeCompare(b.name);
        });
    }
}
