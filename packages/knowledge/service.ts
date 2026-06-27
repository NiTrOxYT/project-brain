import path from "path";

import { FileSystemService } from "../filesystem/index.js";
import { KnowledgeIndex } from "./types.js";

export class KnowledgeService {

    private readonly fs = new FileSystemService();

    constructor(
        private readonly workspace: string
    ) {}

    async initialize(): Promise<void> {

        const knowledgePath = path.join(
            this.workspace,
            "knowledge",
            "index.json"
        );

        const exists = await this.fs.exists(
            knowledgePath
        );

        if (exists) {
            return;
        }

        const data: KnowledgeIndex = {
            files: []
        };

        await this.fs.writeJson(
            knowledgePath,
            data
        );

    }

}
