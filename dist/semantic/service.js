import path from "path";
import { FileSystemService } from "../filesystem";
import { ScannerService } from "../scanner";
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
            const terms = symbol.name
                .replace(/([a-z])([A-Z])/g, "$1 $2")
                .toLowerCase()
                .split(/\s+/)
                .filter(Boolean);
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
