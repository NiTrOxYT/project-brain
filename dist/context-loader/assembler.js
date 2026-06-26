export class ContextAssembler {
    assemble(bundle) {
        return {
            query: bundle.query,
            project: {
                framework: bundle.project.framework,
                language: bundle.project.language,
                packageManager: bundle.project.packageManager
            },
            files: bundle.files
                .sort((a, b) => b.score - a.score)
                .map(file => file.path),
            symbols: bundle.symbols.map(symbol => `${symbol.kind}:${symbol.name}`),
            dependencies: bundle.imports.map(edge => `${edge.source} -> ${edge.target}`)
        };
    }
}
