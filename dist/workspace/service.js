import path from "path";
import { FileSystemService } from "../filesystem";
export class WorkspaceService {
    options;
    fs = new FileSystemService();
    constructor(options) {
        this.options = options;
    }
    get root() {
        return path.join(this.options.root, ".brain");
    }
    get manifestPath() {
        return path.join(this.root, "manifest.json");
    }
    async exists() {
        return this.fs.exists(this.root);
    }
    async create() {
        const directories = [
            "knowledge",
            "graph",
            "index",
            "cache",
            "history",
            "state"
        ];
        await this.fs.mkdir(this.root);
        for (const directory of directories) {
            await this.fs.mkdir(path.join(this.root, directory));
        }
        await this.fs.writeJson(this.manifestPath, {
            schemaVersion: 1,
            brainVersion: "0.1.0",
            project: {
                id: "",
                name: "",
                framework: "unknown",
                language: "unknown",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            workspace: {
                knowledge: "knowledge",
                graph: "graph",
                index: "index",
                cache: "cache",
                history: "history",
                state: "state"
            },
            features: {
                knowledge: true,
                graph: true,
                index: true,
                cache: true,
                history: true,
                state: true
            }
        });
    }
    async initialize() {
        const created = !(await this.exists());
        if (created) {
            await this.create();
        }
        return {
            created,
            root: this.root
        };
    }
    async validate() {
        return this.exists();
    }
    async load() { }
    async dispose() { }
}
