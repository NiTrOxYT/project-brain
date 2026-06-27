import path from "path";

import { FileSystemService } from "../filesystem/index.js";
import { RuntimeCache } from "./types.js";

export class CacheService {

    private readonly fs = new FileSystemService();

    constructor(
        private readonly workspace: string
    ) {}

    async initialize(): Promise<void> {

        const cachePath = path.join(
            this.workspace,
            "cache",
            "runtime.json"
        );

        if (await this.fs.exists(cachePath)) {
            return;
        }

        const cache: RuntimeCache = {

            lastIndexedAt: null,

            lastKnowledgeSync: null,

            lastGraphSync: null

        };

        await this.fs.writeJson(
            cachePath,
            cache
        );

    }

}
