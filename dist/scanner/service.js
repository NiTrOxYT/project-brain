import path from "path";
import { GraphBuilderService } from "../graph-builder/index.js";
import { FileSystemService } from "../filesystem/index.js";
export class ScannerService {
    workspaceRoot;
    fs = new FileSystemService();
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    async snapshot() {
        const graph = await new GraphBuilderService(this.workspaceRoot).build();
        const [project, files, symbols, imports] = await Promise.all([
            this.fs.readJson(path.join(this.workspaceRoot, "knowledge", "project.json")),
            this.fs.readJson(path.join(this.workspaceRoot, "index", "index.json")),
            this.fs.readJson(path.join(this.workspaceRoot, "index", "symbols.json")),
            this.fs.readJson(path.join(this.workspaceRoot, "index", "imports.json"))
        ]);
        return {
            project,
            files: files.files,
            symbols: symbols.symbols,
            imports: imports.imports,
            graph
        };
    }
}
