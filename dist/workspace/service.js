import path from "path";
import { RuntimeService } from "../core/index.js";
import { FileSystemService } from "../filesystem/index.js";
export class WorkspaceService extends RuntimeService {
    options;
    fs = new FileSystemService();
    constructor(options) {
        super();
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
    async ensureSkillFile() {
        const { WorkspaceSkillGenerator } = await import("./skill-generator.js");
        const generator = new WorkspaceSkillGenerator(this.fs, this.root);
        await generator.ensureSkillFile();
    }
    async initialize() {
        const created = !(await this.exists()) || !(await this.fs.exists(this.manifestPath));
        if (created) {
            await this.create();
        }
        await this.ensureSkillFile();
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
