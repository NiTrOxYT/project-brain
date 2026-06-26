import fs from "fs/promises";
import path from "path";
import { FileSystemService } from "../filesystem";
export class IndexerService {
    projectRoot;
    workspaceRoot;
    filesystem = new FileSystemService();
    constructor(projectRoot, workspaceRoot) {
        this.projectRoot = projectRoot;
        this.workspaceRoot = workspaceRoot;
    }
    async index() {
        const files = [];
        await this.walk(this.projectRoot, files);
        const result = {
            files
        };
        await this.filesystem.writeJson(path.join(this.workspaceRoot, "index", "index.json"), result);
        return result;
    }
    async walk(directory, output) {
        const entries = await fs.readdir(directory, {
            withFileTypes: true
        });
        for (const entry of entries) {
            if (entry.name === ".git" ||
                entry.name === ".brain" ||
                entry.name === "node_modules" ||
                entry.name === "dist") {
                continue;
            }
            const fullPath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                await this.walk(fullPath, output);
                continue;
            }
            const stat = await fs.stat(fullPath);
            output.push({
                path: path.relative(this.projectRoot, fullPath),
                extension: path.extname(fullPath),
                size: stat.size,
                modifiedAt: stat.mtime.toISOString()
            });
        }
    }
}
