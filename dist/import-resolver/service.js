import path from "path";
import { FileSystemService } from "../filesystem";
export class ImportResolverService {
    workspaceRoot;
    filesystem = new FileSystemService();
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    async resolve() {
        const index = await this.filesystem.readJson(path.join(this.workspaceRoot, "index", "index.json"));
        const imports = await this.filesystem.readJson(path.join(this.workspaceRoot, "index", "imports.json"));
        const files = new Set(index.files.map(file => file.path));
        const resolved = [];
        for (const record of imports.imports) {
            if (!record.target.startsWith(".")) {
                resolved.push({
                    source: record.source,
                    target: record.target,
                    resolved: false
                });
                continue;
            }
            const directory = path.dirname(record.source);
            const base = path.normalize(path.join(directory, record.target));
            const candidates = [
                base + ".ts",
                base + ".tsx",
                path.join(base, "index.ts")
            ];
            const match = candidates.find(candidate => files.has(candidate));
            resolved.push({
                source: record.source,
                target: match ??
                    record.target,
                resolved: !!match
            });
        }
        return resolved;
    }
}
