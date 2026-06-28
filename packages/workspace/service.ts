import path from "path";
import { RuntimeService } from "../core/index.js";

import { FileSystemService } from "../filesystem/index.js";
import { WorkspaceOptions, WorkspaceResult } from "./types.js";

export interface IWorkspaceService {
    initialize(): Promise<WorkspaceResult>;
    exists(): Promise<boolean>;
    create(): Promise<void>;
    validate(): Promise<boolean>;
    load(): Promise<void>;
    dispose(): Promise<void>;
}

export class WorkspaceService extends RuntimeService {

    private readonly fs = new FileSystemService();

    constructor(
        private readonly options: WorkspaceOptions
    ) {
        super();
    }

    private get root(): string {
        return path.join(this.options.root, ".brain");
    }

    private get manifestPath(): string {
        return path.join(this.root, "manifest.json");
    }

    async exists(): Promise<boolean> {
        return this.fs.exists(this.root);
    }

    async create(): Promise<void> {

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
            await this.fs.mkdir(
                path.join(this.root, directory)
            );
        }

        await this.fs.writeJson(
            this.manifestPath,
            {
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
            }
        );
    }

    async initialize(): Promise<WorkspaceResult> {

        const created = !(await this.exists()) || !(await this.fs.exists(this.manifestPath));

        if (created) {
            await this.create();
        }

        return {
            created,
            root: this.root
        };
    }

    async validate(): Promise<boolean> {
        return this.exists();
    }

    async load(): Promise<void> {}

    async dispose(): Promise<void> {}

}
