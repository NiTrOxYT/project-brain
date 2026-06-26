import path from "path";
import { FileSystemService } from "../filesystem";
export class KnowledgeService {
    workspace;
    fs = new FileSystemService();
    constructor(workspace) {
        this.workspace = workspace;
    }
    async initialize() {
        const knowledgePath = path.join(this.workspace, "knowledge", "index.json");
        const exists = await this.fs.exists(knowledgePath);
        if (exists) {
            return;
        }
        const data = {
            files: []
        };
        await this.fs.writeJson(knowledgePath, data);
    }
}
