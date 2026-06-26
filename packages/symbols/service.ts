import fs from "fs/promises";
import path from "path";

import { FileSystemService } from "../filesystem";
import { SymbolIndex, SymbolRecord } from "./types";

export class SymbolsService {

    private readonly filesystem = new FileSystemService();

    constructor(
        private readonly projectRoot: string,
        private readonly workspaceRoot: string
    ) {}

    async index(): Promise<SymbolIndex> {

        const symbols: SymbolRecord[] = [];

        await this.walk(
            this.projectRoot,
            symbols
        );

        const index: SymbolIndex = {

            generatedAt: new Date().toISOString(),

            symbols

        };

        await this.filesystem.writeJson(

            path.join(
                this.workspaceRoot,
                "index",
                "symbols.json"
            ),

            index

        );

        return index;

    }

    private async walk(

        directory: string,

        output: SymbolRecord[]

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

            if (!fullPath.endsWith(".ts")) {
                continue;
            }

            const content = await fs.readFile(
                fullPath,
                "utf8"
            );

            const lines = content.split("\n");

            for (let i = 0; i < lines.length; i++) {

                const line = lines[i].trim();

                const patterns = [
                    { regex: /^export\s+class\s+(\w+)/, kind: "class" },
                    { regex: /^export\s+interface\s+(\w+)/, kind: "interface" },
                    { regex: /^export\s+type\s+(\w+)/, kind: "type" },
                    { regex: /^export\s+enum\s+(\w+)/, kind: "enum" },
                    { regex: /^export\s+function\s+(\w+)/, kind: "function" },
                    { regex: /^export\s+const\s+(\w+)/, kind: "variable" }
                ] as const;

                for (const pattern of patterns) {

                    const match = line.match(pattern.regex);

                    if (!match) {
                        continue;
                    }

                    output.push({

                        name: match[1],

                        kind: pattern.kind,

                        file: path.relative(
                            this.projectRoot,
                            fullPath
                        ),

                        line: i + 1

                    });

                }

            }

        }

    }

}
