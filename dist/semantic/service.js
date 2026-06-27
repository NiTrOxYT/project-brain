import path from "path";
import { FileSystemService } from "../filesystem/index.js";
import { ScannerService } from "../scanner/index.js";
import { normalize } from "./normalizer.js";
export class SemanticService {
    workspaceRoot;
    filesystem = new FileSystemService();
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    async build() {
        const snapshot = await new ScannerService(this.workspaceRoot).snapshot();
        const entries = [];
        for (const symbol of snapshot.symbols) {
            const terms = normalize(symbol.name);
            entries.push({
                id: symbol.file +
                    "::" +
                    symbol.name,
                file: symbol.file,
                terms,
                weight: 100
            });
        }
        const semantic = {
            generatedAt: new Date().toISOString(),
            entries
        };
        await this.filesystem.writeJson(path.join(this.workspaceRoot, "index", "semantic.json"), semantic);
        return semantic;
    }
}
