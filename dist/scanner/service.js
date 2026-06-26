import path from "path";
import { FileSystemService } from "../filesystem";
export class ScannerService {
    workspaceRoot;
    fs = new FileSystemService();
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    async snapshot() {
        const [project, files, symbols, imports, graph] = await Promise.all([
            this.fs.readJson(path.join(this.workspaceRoot, "knowledge", "project.json")),
            this.fs.readJson(path.join(this.workspaceRoot, "index", "index.json")),
            this.fs.readJson(path.join(this.workspaceRoot, "index", "symbols.json")),
            this.fs.readJson(path.join(this.workspaceRoot, "index", "imports.json")),
            this.fs.readJson(path.join(this.workspaceRoot, "graph", "dependencies.json"))
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
