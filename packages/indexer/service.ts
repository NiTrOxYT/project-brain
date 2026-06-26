import fs from "fs/promises";
import path from "path";

import { FileSystemService } from "../filesystem";
import { IndexResult, IndexedFile } from "./types";

export class IndexerService {

    private readonly filesystem = new FileSystemService();

    constructor(
        private readonly projectRoot: string,
        private readonly workspaceRoot: string
    ) {}

    async index(): Promise<IndexResult> {

        const files: IndexedFile[] = [];

        await this.walk(
            this.projectRoot,
            files
        );

        const result: IndexResult = {
            files
        };

        await this.filesystem.writeJson(
            path.join(
                this.workspaceRoot,
                "index",
                "index.json"
            ),
            result
        );

        return result;

    }

    private async walk(

        directory: string,

        output: IndexedFile[]

    ): Promise<void> {

        const entries = await fs.readdir(
            directory,
            {
                withFileTypes: true
            }
        );

        for (const entry of entries) {

            if (
                entry.name === ".git" ||
                entry.name === ".brain" ||
                entry.name === "node_modules" ||
                entry.name === "dist"
            ) {
                continue;
            }

            const fullPath = path.join(
                directory,
                entry.name
            );

            if (entry.isDirectory()) {

                await this.walk(
                    fullPath,
                    output
                );

                continue;

            }

            const stat = await fs.stat(
                fullPath
            );

            output.push({

                path: path.relative(
                    this.projectRoot,
                    fullPath
                ),

                extension: path.extname(
                    fullPath
                ),

                size: stat.size,

                modifiedAt: stat.mtime.toISOString()

            });

        }

    }

}
