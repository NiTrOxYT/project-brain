import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { PromptPackage, PromptCacheEntry } from "./types";
import { PromptCacheError } from "./errors";

export class PromptCache {
    private readonly cacheDir: string;

    constructor(private readonly workspaceRoot: string) {
        this.cacheDir = path.join(workspaceRoot, ".brain", "prompts", "cache");
    }

    private async ensureDirectory(): Promise<void> {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
        } catch (err: any) {
            throw new PromptCacheError(`Failed to create cache directory: ${err.message}`);
        }
    }

    generateKey(params: {
        task: { id: string; type: string; title: string; file?: string; symbol?: string };
        knowledgeSnapshot?: { version: string; hash: string };
        architectureSnapshot?: { version: string; hash: string };
        learningSnapshot?: { version: string; hash: string };
        providerId: string;
    }): string {
        const payload = JSON.stringify({
            taskId: params.task.id,
            taskType: params.task.type,
            taskTitle: params.task.title,
            taskFile: params.task.file || "",
            taskSymbol: params.task.symbol || "",
            knowledgeHash: params.knowledgeSnapshot?.hash || "none",
            architectureHash: params.architectureSnapshot?.hash || "none",
            learningHash: params.learningSnapshot?.hash || "none",
            providerId: params.providerId
        });

        return crypto.createHash("sha256").update(payload).digest("hex");
    }

    async get(key: string): Promise<PromptPackage | null> {
        await this.ensureDirectory();
        const filePath = path.join(this.cacheDir, `${key}.json`);
        try {
            const raw = await fs.readFile(filePath, "utf8");
            const entry = JSON.parse(raw) as PromptCacheEntry;
            return entry.promptPackage;
        } catch (err: any) {
            if (err.code === "ENOENT") {
                return null;
            }
            throw new PromptCacheError(`Failed to read prompt cache for key ${key}: ${err.message}`);
        }
    }

    async set(key: string, promptPackage: PromptPackage): Promise<void> {
        await this.ensureDirectory();
        const filePath = path.join(this.cacheDir, `${key}.json`);
        const entry: PromptCacheEntry = {
            key,
            promptPackage,
            timestamp: new Date().toISOString()
        };
        try {
            await fs.writeFile(filePath, JSON.stringify(entry, null, 2), "utf8");
        } catch (err: any) {
            throw new PromptCacheError(`Failed to write prompt cache for key ${key}: ${err.message}`);
        }
    }

    async clear(): Promise<void> {
        await this.ensureDirectory();
        try {
            const files = await fs.readdir(this.cacheDir);
            for (const file of files) {
                if (file.endsWith(".json")) {
                    await fs.unlink(path.join(this.cacheDir, file));
                }
            }
        } catch (err: any) {
            throw new PromptCacheError(`Failed to clear cache: ${err.message}`);
        }
    }
}
