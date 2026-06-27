import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { PromptCacheError } from "./errors.js";
export class PromptCache {
    workspaceRoot;
    cacheDir;
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.cacheDir = path.join(workspaceRoot, ".brain", "prompts", "cache");
    }
    async ensureDirectory() {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
        }
        catch (err) {
            throw new PromptCacheError(`Failed to create cache directory: ${err.message}`);
        }
    }
    generateKey(params) {
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
    async get(key) {
        await this.ensureDirectory();
        const filePath = path.join(this.cacheDir, `${key}.json`);
        try {
            const raw = await fs.readFile(filePath, "utf8");
            const entry = JSON.parse(raw);
            return entry.promptPackage;
        }
        catch (err) {
            if (err.code === "ENOENT") {
                return null;
            }
            throw new PromptCacheError(`Failed to read prompt cache for key ${key}: ${err.message}`);
        }
    }
    async set(key, promptPackage) {
        await this.ensureDirectory();
        const filePath = path.join(this.cacheDir, `${key}.json`);
        const entry = {
            key,
            promptPackage,
            timestamp: new Date().toISOString()
        };
        try {
            await fs.writeFile(filePath, JSON.stringify(entry, null, 2), "utf8");
        }
        catch (err) {
            throw new PromptCacheError(`Failed to write prompt cache for key ${key}: ${err.message}`);
        }
    }
    async clear() {
        await this.ensureDirectory();
        try {
            const files = await fs.readdir(this.cacheDir);
            for (const file of files) {
                if (file.endsWith(".json")) {
                    await fs.unlink(path.join(this.cacheDir, file));
                }
            }
        }
        catch (err) {
            throw new PromptCacheError(`Failed to clear cache: ${err.message}`);
        }
    }
}
