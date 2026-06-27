// ──────────────────────────────────────────────────────────────────────────────
// BUILD-052 — Learning Engine — Persistent Storage Layer
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs/promises";
import path from "path";
import {
    LearningExperience,
    ProviderPerformance,
    RepairPattern,
    FailurePattern,
    PromptPerformance,
    OptimizationRule,
    LearningSnapshot
} from "./types.js";
import { LearningStorageError } from "./errors.js";

export class LearningStorage {
    private readonly learningDir: string;

    constructor(private readonly workspaceRoot: string) {
        this.learningDir = path.join(workspaceRoot, "learning");
    }

    private getPath(filename: string): string {
        return path.join(this.learningDir, filename);
    }

    async ensureDirectory(): Promise<void> {
        try {
            await fs.mkdir(this.learningDir, { recursive: true });
        } catch (err: any) {
            throw new LearningStorageError(`Failed to create learning directory: ${err.message}`);
        }
    }

    async loadExperiences(): Promise<LearningExperience[]> {
        return this.loadJson<LearningExperience[]>("experience.json", []);
    }

    async saveExperiences(data: LearningExperience[]): Promise<void> {
        await this.saveJson("experience.json", data);
    }

    async loadProviders(): Promise<ProviderPerformance[]> {
        return this.loadJson<ProviderPerformance[]>("providers.json", []);
    }

    async saveProviders(data: ProviderPerformance[]): Promise<void> {
        await this.saveJson("providers.json", data);
    }

    async loadRepairs(): Promise<RepairPattern[]> {
        return this.loadJson<RepairPattern[]>("repairs.json", []);
    }

    async saveRepairs(data: RepairPattern[]): Promise<void> {
        await this.saveJson("repairs.json", data);
    }

    async loadFailures(): Promise<FailurePattern[]> {
        return this.loadJson<FailurePattern[]>("failures.json", []);
    }

    async saveFailures(data: FailurePattern[]): Promise<void> {
        await this.saveJson("failures.json", data);
    }

    async loadPrompts(): Promise<PromptPerformance[]> {
        return this.loadJson<PromptPerformance[]>("prompts.json", []);
    }

    async savePrompts(data: PromptPerformance[]): Promise<void> {
        await this.saveJson("prompts.json", data);
    }

    async loadOptimizations(): Promise<OptimizationRule[]> {
        return this.loadJson<OptimizationRule[]>("optimizations.json", []);
    }

    async saveOptimizations(data: OptimizationRule[]): Promise<void> {
        await this.saveJson("optimizations.json", data);
    }

    async loadMetadata(): Promise<Record<string, any>> {
        return this.loadJson<Record<string, any>>("metadata.json", { version: "1.0.0" });
    }

    async saveMetadata(data: Record<string, any>): Promise<void> {
        await this.saveJson("metadata.json", data);
    }

    private async loadJson<T>(filename: string, defaultValue: T): Promise<T> {
        await this.ensureDirectory();
        const filePath = this.getPath(filename);
        try {
            const raw = await fs.readFile(filePath, "utf8");
            return JSON.parse(raw) as T;
        } catch (err: any) {
            if (err.code === "ENOENT") {
                return defaultValue;
            }
            throw new LearningStorageError(`Failed to load ${filename}: ${err.message}`);
        }
    }

    private async saveJson(filename: string, data: unknown): Promise<void> {
        await this.ensureDirectory();
        const filePath = this.getPath(filename);
        try {
            await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
        } catch (err: any) {
            throw new LearningStorageError(`Failed to save ${filename}: ${err.message}`);
        }
    }

    async exportSnapshot(): Promise<LearningSnapshot> {
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

    async importSnapshot(snapshot: LearningSnapshot): Promise<void> {
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

    async compaction(): Promise<void> {
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

    async reset(): Promise<void> {
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
            } catch (err: any) {
                if (err.code !== "ENOENT") {
                    throw new LearningStorageError(`Failed to reset storage file ${file}: ${err.message}`);
                }
            }
        }
    }
}
