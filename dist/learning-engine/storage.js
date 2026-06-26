// ──────────────────────────────────────────────────────────────────────────────
// BUILD-052 — Learning Engine — Persistent Storage Layer
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs/promises";
import path from "path";
import { LearningStorageError } from "./errors";
export class LearningStorage {
    workspaceRoot;
    learningDir;
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.learningDir = path.join(workspaceRoot, "learning");
    }
    getPath(filename) {
        return path.join(this.learningDir, filename);
    }
    async ensureDirectory() {
        try {
            await fs.mkdir(this.learningDir, { recursive: true });
        }
        catch (err) {
            throw new LearningStorageError(`Failed to create learning directory: ${err.message}`);
        }
    }
    async loadExperiences() {
        return this.loadJson("experience.json", []);
    }
    async saveExperiences(data) {
        await this.saveJson("experience.json", data);
    }
    async loadProviders() {
        return this.loadJson("providers.json", []);
    }
    async saveProviders(data) {
        await this.saveJson("providers.json", data);
    }
    async loadRepairs() {
        return this.loadJson("repairs.json", []);
    }
    async saveRepairs(data) {
        await this.saveJson("repairs.json", data);
    }
    async loadFailures() {
        return this.loadJson("failures.json", []);
    }
    async saveFailures(data) {
        await this.saveJson("failures.json", data);
    }
    async loadPrompts() {
        return this.loadJson("prompts.json", []);
    }
    async savePrompts(data) {
        await this.saveJson("prompts.json", data);
    }
    async loadOptimizations() {
        return this.loadJson("optimizations.json", []);
    }
    async saveOptimizations(data) {
        await this.saveJson("optimizations.json", data);
    }
    async loadMetadata() {
        return this.loadJson("metadata.json", { version: "1.0.0" });
    }
    async saveMetadata(data) {
        await this.saveJson("metadata.json", data);
    }
    async loadJson(filename, defaultValue) {
        await this.ensureDirectory();
        const filePath = this.getPath(filename);
        try {
            const raw = await fs.readFile(filePath, "utf8");
            return JSON.parse(raw);
        }
        catch (err) {
            if (err.code === "ENOENT") {
                return defaultValue;
            }
            throw new LearningStorageError(`Failed to load ${filename}: ${err.message}`);
        }
    }
    async saveJson(filename, data) {
        await this.ensureDirectory();
        const filePath = this.getPath(filename);
        try {
            await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
        }
        catch (err) {
            throw new LearningStorageError(`Failed to save ${filename}: ${err.message}`);
        }
    }
    async exportSnapshot() {
        const [experiences, providers, repairs, failures, prompts, optimizations, metadata] = await Promise.all([
            this.loadExperiences(),
            this.loadProviders(),
            this.loadRepairs(),
            this.loadFailures(),
            this.loadPrompts(),
            this.loadOptimizations(),
            this.loadMetadata()
        ]);
        return {
            timestamp: new Date().toISOString(),
            experiences,
            providers,
            repairs,
            failures,
            prompts,
            optimizations,
            metadata
        };
    }
    async importSnapshot(snapshot) {
        await this.ensureDirectory();
        await Promise.all([
            this.saveExperiences(snapshot.experiences || []),
            this.saveProviders(snapshot.providers || []),
            this.saveRepairs(snapshot.repairs || []),
            this.saveFailures(snapshot.failures || []),
            this.savePrompts(snapshot.prompts || []),
            this.saveOptimizations(snapshot.optimizations || []),
            this.saveMetadata(snapshot.metadata || { version: "1.0.0" })
        ]);
    }
    async compaction() {
        // Keep only last 100 experiences to prevent unbounded growth, recalculating metadata/averages.
        const experiences = await this.loadExperiences();
        if (experiences.length > 100) {
            const truncated = experiences.slice(-100);
            await this.saveExperiences(truncated);
        }
        const metadata = await this.loadMetadata();
        metadata.lastCompactTime = new Date().toISOString();
        await this.saveMetadata(metadata);
    }
    async reset() {
        await this.ensureDirectory();
        const files = [
            "experience.json",
            "providers.json",
            "repairs.json",
            "failures.json",
            "prompts.json",
            "optimizations.json",
            "metadata.json"
        ];
        for (const file of files) {
            try {
                await fs.unlink(this.getPath(file));
            }
            catch (err) {
                if (err.code !== "ENOENT") {
                    throw new LearningStorageError(`Failed to reset storage file ${file}: ${err.message}`);
                }
            }
        }
    }
}
