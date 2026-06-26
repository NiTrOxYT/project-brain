import { GraphTraversalService } from "../graph-traversal";
import path from "path";
import { FileSystemService } from "../filesystem";
import { RetrieverService } from "../retriever";
export class ContextLoaderService {
    workspaceRoot;
    filesystem = new FileSystemService();
    retriever;
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.retriever =
            new RetrieverService(workspaceRoot);
    }
    async load(request) {
        const retrieval = await this.retriever.retrieve({
            query: request.query,
            limit: 10
        });
        const expandedFiles = await new GraphTraversalService(this.workspaceRoot).traverse(retrieval.files.map(file => file.path), 1);
        const project = await this.filesystem.readJson(path.join(this.workspaceRoot, "knowledge", "project.json"));
        const symbols = await this.filesystem.readJson(path.join(this.workspaceRoot, "index", "symbols.json"));
        const imports = await this.filesystem.readJson(path.join(this.workspaceRoot, "index", "imports.json"));
        return {
            query: request.query,
            project,
            files: retrieval.files.filter(file => expandedFiles.includes(file.path)),
            symbols: symbols.symbols.filter((symbol) => retrieval.files.some(file => file.path === symbol.file)),
            imports: imports.imports.filter((edge) => retrieval.files.some(file => file.path === edge.source))
        };
    }
}
