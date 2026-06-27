import fs from "fs/promises";
import path from "path";

import { FileSystemService } from "../filesystem/index.js";
import { ProjectInfo } from "./types.js";

export class ProjectService {

    private readonly filesystem = new FileSystemService();

    constructor(
        private readonly root: string,
        private readonly workspaceRoot: string
    ) {}

    async detect(): Promise<ProjectInfo> {

        const packageJsonPath = path.join(
            this.root,
            "package.json"
        );

        let packageJson: any = {};

        try {

            packageJson = JSON.parse(
                await fs.readFile(
                    packageJsonPath,
                    "utf8"
                )
            );

        } catch {}

        const dependencies = {
            ...(packageJson.dependencies ?? {}),
            ...(packageJson.devDependencies ?? {})
        };

        const project: ProjectInfo = {

            name:
                packageJson.name ??
                path.basename(this.root),

            root: this.root,

            framework: this.detectFramework(
                dependencies
            ),

            language: await this.detectLanguage(),

            packageManager:
                await this.detectPackageManager()

        };

        await this.filesystem.writeJson(

            path.join(
                this.workspaceRoot,
                "knowledge",
                "project.json"
            ),

            project

        );

        return project;

    }

    private detectFramework(
        dependencies: Record<string, string>
    ): string {

        if ("next" in dependencies) return "nextjs";
        if ("react" in dependencies) return "react";
        if ("vue" in dependencies) return "vue";
        if ("@angular/core" in dependencies) return "angular";
        if ("svelte" in dependencies) return "svelte";
        if ("express" in dependencies) return "express";
        if ("fastify" in dependencies) return "fastify";

        return "unknown";

    }

    private async detectLanguage(): Promise<string> {

        try {

            await fs.access(
                path.join(
                    this.root,
                    "tsconfig.json"
                )
            );

            return "typescript";

        } catch {

            return "javascript";

        }

    }

    private async detectPackageManager(): Promise<
        "npm" | "pnpm" | "yarn" | "bun" | "unknown"
    > {

        const checks = [

            ["pnpm-lock.yaml", "pnpm"],

            ["package-lock.json", "npm"],

            ["yarn.lock", "yarn"],

            ["bun.lockb", "bun"]

        ] as const;

        for (const [file, manager] of checks) {

            try {

                await fs.access(
                    path.join(
                        this.root,
                        file
                    )
                );

                return manager;

            } catch {}

        }

        return "unknown";

    }

}
