import path from "path";
import { FileSystemService } from "../filesystem";
export class CacheService {
    workspace;
    fs = new FileSystemService();
    constructor(workspace) {
        this.workspace = workspace;
    }
    async initialize() {
        const cachePath = path.join(this.workspace, "cache", "runtime.json");
        if (await this.fs.exists(cachePath)) {
            return;
        }
        const cache = {
            lastIndexedAt: null,
            lastKnowledgeSync: null,
            lastGraphSync: null
        };
        await this.fs.writeJson(cachePath, cache);
    }
}
