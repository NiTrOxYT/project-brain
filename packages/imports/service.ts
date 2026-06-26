import fs from "fs/promises";
import path from "path";

import { FileSystemService } from "../filesystem";
import { ImportIndex, ImportRecord } from "./types";

export class ImportsService {

    private readonly filesystem = new FileSystemService();

    constructor(
        private readonly projectRoot: string,
        private readonly workspaceRoot: string
    ) {}

    async index(): Promise<ImportIndex> {

        const imports: ImportRecord[] = [];

        await this.walk(
            this.projectRoot,
            imports
        );

        const index: ImportIndex = {
            generatedAt: new Date().toISOString(),
            imports
        };

        await this.filesystem.writeJson(
            path.join(
                this.workspaceRoot,
                "index",
                "imports.json"
            ),
            index
        );

        return index;

    }

    private async walk(
        directory: string,
        output: ImportRecord[]
    ): Promise<void> {

        const entries = await fs.readdir(directory, {
            withFileTypes: true
        });

        for (const entry of entries) {

            if (
                entry.name === ".git" ||
                entry.name === ".brain" ||
                entry.name === "node_modules" ||
                entry.name === "dist"
            ) {
                continue;
            }

            const fullPath = path.join(directory, entry.name);

            if (entry.isDirectory()) {
                await this.walk(fullPath, output);
                continue;
            }

            if (
                !fullPath.endsWith(".ts") &&
                !fullPath.endsWith(".tsx")
            ) {
                continue;
            }

            const content = await fs.readFile(
                fullPath,
                "utf8"
            );

            const regex =
                /import\s+(?:.*?\s+from\s+)?["']([^"']+)["']/g;

            let match: RegExpExecArray | null;

            while ((match = regex.exec(content)) !== null) {

                output.push({

                    source: path.relative(
                        this.projectRoot,
                        fullPath
                    ),

                    target: match[1]

                });

            }

        }

    }

}
